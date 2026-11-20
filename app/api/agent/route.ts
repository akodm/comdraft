import { createAgentHandler } from 'dopus';
import agent from '@/agent.config';

// Seconds this route may run (your platform's limit applies). Passing it lets the agent stop calling tools at
// 75% of it and answer with what it has, instead of being cut off mid-stream.
export const maxDuration = 60;

// dopus 0.5 부터 승인 서명 비밀이 없으면 500, JSON 이 아니면 415, 다른 출처면 403 으로 자체 거절함
export const POST = createAgentHandler(agent, { maxDuration });
