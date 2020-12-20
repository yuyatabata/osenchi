import { JobExecutor } from './job-executor';

export interface IStateInfo {
    id: string;
    srcBucket: string;
    objectKey: string;
}

export async function handler(event: IStateInfo): Promise<IStateInfo> {
    await JobExecutor.executor(event.srcBucket, event.objectKey);
    return event;
}