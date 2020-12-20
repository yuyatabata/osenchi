import * as sfn from '@aws-cdk/aws-stepfunctions';
import * as tasks from '@aws-cdk/aws-stepfunctions-tasks';
import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';
import * as sns from '@aws-cdk/aws-sns';
import * as subscriptions from '@aws-cdk/aws-sns-subscriptions';
import * as cloudtrail from '@aws-cdk/aws-cloudtrail';
import * as events from '@aws-cdk/aws-events';
import * as targets from '@aws-cdk/aws-events-targets';
import * as lambda from '@aws-cdk/aws-lambda';
import * as iam from '@aws-cdk/aws-iam';

require('dotenv').config();
const env = process.env;

export class OsenchiStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const inputBucket = new s3.Bucket(this, 'OsenchiInputBucket', {
      bucketName: 'osenchi-inputbucket'
    });

    const outputBucket = new s3.Bucket(this, 'OsenchiOutputBucket', {
      bucketName: 'osenchi-outputbucket'
    });

    const emailTopic = new sns.Topic(this, 'Topic', {
      topicName: 'osenchi-topic'
    });

    const email = <string>env.EMAIL;
    emailTopic.addSubscription(new subscriptions.EmailSubscription(email));

    const successTask = new sfn.Task(this, 'SendSuccessMail', {
      task: new tasks.PublishToTopic(emailTopic, {
        subject: `Osenchi Success`,
        message: sfn.TaskInput.fromDataAt('$.*'),
      }),
    });

    const logBucket = new s3.Bucket(this, 'LogBucket', {
      bucketName: 'tabata-osenchi-logbucket'
    });

    const trail = new cloudtrail.Trail(this, 'Trail', {
      bucket: logBucket,
      isMultiRegionTrail: false
    });

    trail.addS3EventSelector([{ bucket: inputBucket }], {
      readWriteType: cloudtrail.ReadWriteType.WRITE_ONLY,
    });

    const rule = new events.Rule(this, 'EventRule', {
      eventPattern: {
        source: ['aws.s3'],
        detail: {
          'eventSource': ['s3.amazonaws.com'],
          'eventName': ['PutObject'],
          'requestParameters': {
            'bucketName': [inputBucket.bucketName]
          }
        }
      }
    });


    const detectionFunc = new lambda.Function(this, 'DetectionFunc', {
      functionName: 'osenchi-detect-sentiment',
      code: lambda.Code.fromAsset('functions/detect-sentiment', {
        exclude: ['*.ts'],
      }),
      handler: 'index.handler',
      runtime: lambda.Runtime.NODEJS_12_X,
      timeout: cdk.Duration.minutes(5),
      environment: {
        DEST_BUCKET: outputBucket.bucketName
      },
    });

    const deletionFunc = new lambda.Function(this, 'DeletionFunc', {
      functionName: 'osenchi-delete-object',
      code: lambda.Code.fromAsset('functions/delete-object', {
        exclude: ['*.ts'],
      }),
      handler: 'index.handler',
      runtime: lambda.Runtime.NODEJS_12_X,
    })

    inputBucket.grantRead(detectionFunc);
    outputBucket.grantWrite(detectionFunc);
    const policy = new iam.PolicyStatement({
      resources: ['*'],
      actions: ['comprehend:BatchDetectSentiment'],
    });
    detectionFunc.addToRolePolicy(policy);
    inputBucket.grantDelete(deletionFunc);

    const sentimentTask = new sfn.Task(this, 'DetectSentiment', {
      task: new tasks.InvokeFunction(detectionFunc),
    });

    const deleteTask = new sfn.Task(this, 'DeleteObject', {
      task: new tasks.InvokeFunction(deletionFunc),
    });

    const errorTask = new sfn.Task(this, 'SendErrorMail', {
      task: new tasks.PublishToTopic(emailTopic, {
        subject: `Osenchi Error`,
        message: sfn.TaskInput.fromDataAt('$.*'),
      }),
    });

    const mainFlow = sentimentTask.next(deleteTask).next(successTask);
    const parallel = new sfn.Parallel(this, 'Parallel');
    parallel.branch(mainFlow);
    parallel.addCatch(errorTask, { resultPath: '$.error' });

    const stateMachine = new sfn.StateMachine(this, 'OsenchiStateMachine', {
      definition: parallel,
      timeout: cdk.Duration.minutes(30)
    });
  
    const target = new targets.SfnStateMachine(stateMachine);
    rule.addTarget(target);

  }

}
