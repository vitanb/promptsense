# PromptSense — AWS Deployment Guide

This document walks you from a brand-new AWS account to a fully running production environment.

---

## Architecture overview

```
Internet
  │
  ├─ CloudFront (CDN + WAF) ─── S3 (React SPA)
  │
  └─ Route 53 ─── ALB (HTTPS/TLS 1.3)
                     │
                     └─ ECS Fargate (Node.js backend, 2+ replicas)
                           │
                           ├─ RDS PostgreSQL 16  (isolated subnet, Multi-AZ)
                           └─ ElastiCache Redis   (private subnet, TLS + AUTH)

Secrets Manager  →  injects DATABASE_URL / REDIS_URL / JWT_SECRET / ENCRYPTION_KEY at runtime
ECR              →  Docker image registry
GitHub Actions   →  CI/CD via OIDC (no long-lived AWS keys)
```

---

## Prerequisites

| Tool        | Version  | Install                         |
|-------------|----------|---------------------------------|
| Terraform   | ≥ 1.6    | `brew install terraform`        |
| AWS CLI     | ≥ 2.x    | `brew install awscli`           |
| Docker      | ≥ 24     | docker.com/get-docker           |
| Node.js     | 20.x     | `brew install node`             |

You also need:
- An AWS account with admin credentials configured (`aws configure`)
- A domain name with a **Route 53 hosted zone** already created (e.g. `promptsense.io`)
- A GitHub repo containing this codebase

---

## Step 1 — Bootstrap Terraform state storage

Terraform stores its state in S3. Create the bucket and DynamoDB lock table **once** before the first `apply`:

```bash
# Set your region
REGION=us-east-1

# Create S3 state bucket (name must be globally unique)
aws s3api create-bucket \
  --bucket promptsense-terraform-state \
  --region $REGION

aws s3api put-bucket-versioning \
  --bucket promptsense-terraform-state \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption \
  --bucket promptsense-terraform-state \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# Create DynamoDB lock table
aws dynamodb create-table \
  --table-name promptsense-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region $REGION
```

---

## Step 2 — Configure Terraform variables

Copy the example file and fill in your values:

```bash
cd infrastructure/terraform
cp terraform.tfvars.example terraform.tfvars
```

**`terraform.tfvars`** (never commit this file):

```hcl
aws_region    = "us-east-1"
environment   = "production"
domain_name   = "promptsense.io"       # must have a Route 53 hosted zone

jwt_secret     = "CHANGE_ME_min_32_characters_random_string"
encryption_key = "EXACTLY_32_CHARS!!"   # must be exactly 32 chars for AES-256

stripe_secret_key     = "sk_live_..."
stripe_webhook_secret = "whsec_..."

# Optional overrides
db_instance_class     = "db.t4g.small"  # upgrade for production load
redis_node_type       = "cache.t4g.micro"
backend_desired_count = 2
```

---

## Step 3 — Provision infrastructure

```bash
cd infrastructure/terraform

terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

The first apply takes ~15 minutes (RDS + ACM validation are the slow steps).

At the end, Terraform prints:

```
app_url                 = "https://app.promptsense.io"
api_url                 = "https://api.promptsense.io"
ecr_backend_url         = "123456789.dkr.ecr.us-east-1.amazonaws.com/ps-production/backend"
ecs_cluster_name        = "ps-production-cluster"
ecs_service_name        = "ps-production-backend"
frontend_bucket_name    = "ps-production-frontend-abc12345"
cloudfront_distribution_id = "E1234ABCDEF"
github_actions_role_arn = "arn:aws:iam::123456789:role/ps-production-github-actions-role"
```

Save these — you need them in Step 4.

---

## Step 4 — Set GitHub Actions secrets

In your repo: **Settings → Secrets and variables → Actions → New repository secret**

| Secret name            | Value (from Terraform outputs)                    |
|------------------------|---------------------------------------------------|
| `AWS_ROLE_ARN`         | `github_actions_role_arn`                         |
| `AWS_REGION`           | `us-east-1`                                       |
| `ECS_CLUSTER`          | `ecs_cluster_name`                                |
| `ECS_SERVICE`          | `ecs_service_name`                                |
| `ECR_BACKEND`          | `ecr_backend_url`                                 |
| `FRONTEND_BUCKET`      | `frontend_bucket_name`                            |
| `CLOUDFRONT_ID`        | `cloudfront_distribution_id`                      |
| `DOMAIN_NAME`          | `promptsense.io`                                  |
| `APP_SUBDOMAIN`        | `app`                                             |
| `API_SUBDOMAIN`        | `api`                                             |
| `PRIVATE_SUBNET_IDS`   | comma-separated private subnet IDs from AWS console |
| `ECS_SECURITY_GROUP`   | ECS security group ID from AWS console            |

Also update `infrastructure/terraform/iam.tf` — replace `YOUR_GITHUB_ORG/promptsense` with your actual GitHub org and repo name, then re-apply.

---

## Step 5 — First deploy

Push to `main` or trigger `workflow_dispatch` in GitHub Actions.

The pipeline will:
1. Run tests against a fresh PostgreSQL container
2. Build and push the backend Docker image to ECR
3. Build the React frontend and upload to S3
4. Run database migrations as a one-off ECS task
5. Rolling-deploy the new backend version to ECS
6. Invalidate the CloudFront cache
7. Smoke-test both URLs

Total deploy time: ~8 minutes.

---

## Step 6 — Verify

```bash
# API health check
curl https://api.promptsense.io/health

# Expected:
# {"status":"ok","timestamp":"...","version":"1.0.0"}
```

Open `https://app.promptsense.io` in a browser and register your first account.

---

## Ongoing operations

### Deploy a new version
```bash
git push origin main          # triggers automatic deploy
```

### Run migrations manually
```bash
aws ecs run-task \
  --cluster ps-production-cluster \
  --task-definition ps-production-backend \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx,subnet-yyy],securityGroups=[sg-xxx],assignPublicIp=DISABLED}" \
  --overrides '{"containerOverrides":[{"name":"backend","command":["node","src/db/migrate.js"]}]}'
```

### View backend logs
```bash
aws logs tail /ecs/ps-production-backend --follow
```

### Scale backend replicas
```bash
aws ecs update-service \
  --cluster ps-production-cluster \
  --service ps-production-backend \
  --desired-count 4
```

### SSH into a running container (ECS Exec)
```bash
TASK=$(aws ecs list-tasks --cluster ps-production-cluster \
  --service-name ps-production-backend --query 'taskArns[0]' --output text)

aws ecs execute-command \
  --cluster ps-production-cluster \
  --task $TASK \
  --container backend \
  --interactive \
  --command "/bin/sh"
```

### Rotate a secret
1. Update the value in AWS Secrets Manager (console or CLI)
2. Force a new ECS deployment to pick up the new value:
```bash
aws ecs update-service \
  --cluster ps-production-cluster \
  --service ps-production-backend \
  --force-new-deployment
```

---

## Cost estimate (production, us-east-1)

| Service                   | Config                      | $/month  |
|---------------------------|-----------------------------|----------|
| ECS Fargate               | 2× 0.5 vCPU / 1 GB         | ~$30     |
| RDS PostgreSQL            | db.t4g.micro, 20 GB, Multi-AZ | ~$30   |
| ElastiCache Redis         | cache.t4g.micro             | ~$12     |
| ALB                       | ~1 LCU                      | ~$18     |
| CloudFront                | First 1 TB free             | ~$0–$9   |
| NAT Gateways (2×)         |                             | ~$65     |
| Data transfer + misc      |                             | ~$10     |
| **Total**                 |                             | **~$175/month** |

To reduce cost for staging: use `db.t4g.micro` + `multi_az = false`, single NAT gateway, and `backend_desired_count = 1`.

---

## Teardown

```bash
cd infrastructure/terraform
terraform destroy
```

> ⚠️ RDS has `deletion_protection = true`. Disable it in the console (or set `db_instance_class = "db.t4g.micro"` + re-apply) before destroying.
