import { JobExecutor, IJobParameter } from './job-executor';

export interface IStateRequest {
    id: string;
    detail: {
        requestParameters: {
            bucketName: string;
            key: string;
        };
    };
}

export interface IStateResponse {
    id: string;
    srcBucket: string;
    objectKey: string;
    destBucket: string;
}

export async function handler(event: IStateRequest): Promise<IStateResponse> {
    const job: IJobParameter = {
        id: event.id,
        srcBucket: event.detail.requestParameters.bucketName,
        objectKey: event.detail.requestParameters.key,
        destBucket: process.env.DEST_BUCKET!,
    };
    await JobExecutor.execute(job);
    return job;
}