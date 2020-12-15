#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { OsenchiStack } from '../lib/osenchi-stack';

const app = new cdk.App();
new OsenchiStack(app, 'OsenchiStack');
