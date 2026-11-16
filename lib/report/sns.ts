import { AwsClient } from 'aws4fetch';

/**
 * AWS SNS 토픽 발행 (일일 현황 보고 이메일)
 * - 작성 Lambda 를 호출하는 invoker IAM 사용자 키를 그대로 사용 (이 토픽 sns:Publish 권한만 있음)
 * - 이메일 구독은 본문을 일반 텍스트로 받음
 */

const REQUEST_TIMEOUT_MS = 10_000;

export interface SnsPublishConfig {
  topicArn: string;
  accessKeyId: string;
  secretAccessKey: string;
}

// arn:aws:sns:{region}:{account}:{topic}
export const parseSnsRegion = (topicArn: string) => {
  const [arn, partition, service, region] = topicArn.split(':');

  if (arn !== 'arn' || !partition || service !== 'sns' || !region) {
    throw new Error('SNS 토픽 ARN 형식이 아닙니다.');
  }

  return region;
};

export const buildSnsPublishBody = ({
  topicArn,
  subject,
  message,
}: {
  topicArn: string;
  subject: string;
  message: string;
}) =>
  new URLSearchParams({
    Action: 'Publish',
    Version: '2010-03-31',
    TopicArn: topicArn,
    Subject: subject,
    Message: message,
  }).toString();

export const publishToSns = async (
  { topicArn, accessKeyId, secretAccessKey }: SnsPublishConfig,
  subject: string,
  message: string,
  fetchImpl: typeof fetch = fetch,
) => {
  const region = parseSnsRegion(topicArn);
  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    region,
    service: 'sns',
  });

  const signed = await client.sign(`https://sns.${region}.amazonaws.com/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: buildSnsPublishBody({ topicArn, subject, message }),
  });

  const response = await fetchImpl(signed, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`SNS 발행 실패 (${response.status})`);
  }
};
