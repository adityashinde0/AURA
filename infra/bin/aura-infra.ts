#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AuraCloudIntakeStack } from '../lib/aura-cloud-intake-stack';

const app = new cdk.App();

new AuraCloudIntakeStack(app, 'AuraCloudIntakeStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT || '123456789012',
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'Project AURA Phase 2 Cloud Intake Stack (API Gateway, Lambda, DynamoDB, SQS, EventBridge, KMS, WAF)',
});
