const aws = require('aws-sdk');

const COMPREHEND_BATCH_SIZE = 25;
const s3 = new aws.S3();
const comprehend = new aws.Comprehend();

export interface IJobParameter {
    id: string;
    srcBucket: string;
    objectKey: string;
    destBucket: string;
}

interface IComprehend {
    id: string;
    topic: string;
    language: string;
    content: string;
    sentiment: string;
    score?: {
        positive: number;
        negative: number;
        neutral: number;
        mixed: number;
    };
}

export class JobExecutor {
    public static async execute(job: IJobParameter): Promise<void> {
        const items = await JobExecutor.getItems(job.srcBucket, job.objectKey);

        const dict = JobExecutor.divideByLanguage(items);

        for (const ary of dict) {
            await JobExecutor.detectSentiment(ary[0], ary[1]);
        }
        await JobExecutor.putJsonLines(job.destBucket, job.objectKey, items);
    }

    private static async getItems(srcBucket: string, objectKey: string): Promise<IComprehend[]> {
        const res = await s3
            .getObject({
                Bucket: srcBucket,
                Key: objectKey,
            })
            .promise();
        const items: IComprehend[] = [];

        if (res.Body) {
            const lines = res.Body.toString().split(/\r?\n/);
            lines.forEach((text: string) => {
                if (text) {
                    const obj: IComprehend = JSON.parse(text);
                    items.push(obj);    
                }
            });
        }

        return new Promise(resolve => {
            resolve(items);
        });
    }

    private static divideByLanguage(items: IComprehend[]): Map<string, IComprehend[]> {
        const dict = new Map<string, IComprehend[]>();

        items.forEach(item => {
            const key = item.language;
            const list = dict.get(key) || [];
            list.push(item);
            dict.set(key, list);
        });

        return dict;
    }

    private static async detectSentiment(language: string, items: IComprehend[]): Promise<void>{
        const blocks: IComprehend[][] = items.reduce<IComprehend[][]>(
            (prev, value, index) =>
                index % COMPREHEND_BATCH_SIZE ? prev : [...prev, items.slice(index, index + COMPREHEND_BATCH_SIZE)],[],
        );

        for (const list of blocks) {
            const res = await comprehend
                .BatchDetectSentiment({
                    TextList: list.map(x => x['content']),
                    LanguageCode: language,
                })
                .promise();
            
            res.ResultList.forEach((result: { Index: any; Sentiment: string; SentimentScore: { Positive: any; Negatime: any; Neutral: any; Mixed: any; }; }) => {
                const index = result.Index;
                if (index !== undefined) {
                    const doc = list[index];
                    doc.sentiment = result.Sentiment;
                    doc.score = {
                        positive: result.SentimentScore?.Positive || 0,
                        negative: result.SentimentScore?.Negatime || 0,
                        neutral: result.SentimentScore?.Neutral || 0,
                        mixed: result.SentimentScore?.Mixed || 0,
                    };
                }
            });
        }
    }

    private static async putJsonLines(destbucket: string, objectKey: string, items: IComprehend[]): Promise<void> {
        const lines: string[] = [];
        items.forEach(item => {
            const line = JSON.stringify(item);
            lines.push(line);
        });

        await s3
            .pushObject({
                Bucket: destbucket,
                Key: objectKey,
                Body: lines.join('\n'),
            })
            .promise();
    }
}