#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "@aws-cdk/core";
import { APIGWRestSFNDirectIntegrationStack } from "../lib/apigw-rest-sfn-direct-integration-stack";

const app = new cdk.App();
new APIGWRestSFNDirectIntegrationStack(app, "CodeStack");
