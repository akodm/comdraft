import { createAgentHandler } from 'dopus';
import agent from '@/agent.config';

// Seconds this route may run (your platform's limit applies). Passing it lets the agent stop calling tools at
// 75% of it and answer with what it has, instead of being cut off mid-stream.
export const maxDuration = 60;

export const POST = createAgentHandler(agent, { maxDuration });
