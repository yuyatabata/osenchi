import * as sfn from '@aws-cdk/aws-stepfunctions';
import * as tasks from '@aws-cdk/aws-stepfunctions-tasks';
import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';
import * as sns from '@aws-cdk/aws-sns';
import * as subscriptions from '@aws-cdk/aws-sns-subscriptions';
import * as cloudtrail from '@aws-cdk/aws-cloudtrail';

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

    const stateMachine = new sfn.StateMachine(this, 'OsenchiStateMachine', {
      definition: successTask,
      timeout: cdk.Duration.minutes(30)
    });

    const logBucket = new s3.Bucket(this, 'LogBucket', {
      bucketName: 'osenchi-logbucket'
    })

    const trail = new cloudtrail.Trail(this, 'Trail', {
      bucket: logBucket,
      isMultiRegionTrail: false
    });
    trail.addS3EventSelector([`arn:aws:s3:::${inputBucket.bucketName}/`], {
      readWriteType: cloudtrail.ReadWriteType.WRITE_ONLY,
    });
  }
}
