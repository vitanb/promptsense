# ── URLs ──────────────────────────────────────────────────────────────────────
output "app_url" {
  description = "Frontend application URL"
  value       = "https://${local.app_fqdn}"
}

output "api_url" {
  description = "Backend API URL"
  value       = "https://${local.api_fqdn}"
}

# ── ALB ───────────────────────────────────────────────────────────────────────
output "alb_dns_name" {
  description = "ALB DNS name (used by Route 53 alias)"
  value       = aws_lb.main.dns_name
}

# ── ECR ───────────────────────────────────────────────────────────────────────
output "ecr_backend_url" {
  description = "ECR URL for the backend image — use in CI/CD push commands"
  value       = aws_ecr_repository.backend.repository_url
}

output "ecr_frontend_url" {
  description = "ECR URL for the frontend image"
  value       = aws_ecr_repository.frontend.repository_url
}

# ── ECS ───────────────────────────────────────────────────────────────────────
output "ecs_cluster_name" {
  description = "ECS cluster name — needed for GitHub Actions deploy step"
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "ECS service name — needed for GitHub Actions deploy step"
  value       = aws_ecs_service.backend.name
}

# ── S3 ────────────────────────────────────────────────────────────────────────
output "frontend_bucket_name" {
  description = "S3 bucket for frontend assets — used in CI/CD sync step"
  value       = aws_s3_bucket.frontend.id
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID — used to create cache invalidations after deploy"
  value       = aws_cloudfront_distribution.frontend.id
}

# ── RDS ───────────────────────────────────────────────────────────────────────
output "db_endpoint" {
  description = "RDS PostgreSQL endpoint (private — only reachable from within the VPC)"
  value       = aws_db_instance.main.address
  sensitive   = true
}

output "db_secret_arn" {
  description = "Secrets Manager ARN containing full DB credentials"
  value       = aws_secretsmanager_secret.db_credentials.arn
}

# ── Redis ─────────────────────────────────────────────────────────────────────
output "redis_endpoint" {
  description = "ElastiCache Redis primary endpoint"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
  sensitive   = true
}

# ── IAM ───────────────────────────────────────────────────────────────────────
output "github_actions_role_arn" {
  description = "IAM role ARN for GitHub Actions OIDC — set as AWS_ROLE_ARN secret in GitHub"
  value       = aws_iam_role.github_actions.arn
}

# ── Quick-start summary for the operator ─────────────────────────────────────
output "next_steps" {
  description = "Post-apply checklist"
  value       = <<-EOT
    ✅ Infrastructure provisioned. Next steps:

    1. Set these GitHub Actions secrets in your repo settings:
       AWS_ROLE_ARN         = ${aws_iam_role.github_actions.arn}
       AWS_REGION           = ${var.aws_region}
       ECS_CLUSTER          = ${aws_ecs_cluster.main.name}
       ECS_SERVICE          = ${aws_ecs_service.backend.name}
       ECR_BACKEND          = ${aws_ecr_repository.backend.repository_url}
       FRONTEND_BUCKET      = ${aws_s3_bucket.frontend.id}
       CLOUDFRONT_ID        = ${aws_cloudfront_distribution.frontend.id}

    2. Run the first deploy by pushing to main (or triggering workflow_dispatch).

    3. After the first deploy, run DB migrations:
       aws ecs run-task --cluster ${aws_ecs_cluster.main.name} \
         --task-definition ${local.name_prefix}-backend \
         --overrides '{"containerOverrides":[{"name":"backend","command":["node","src/db/migrate.js"]}]}' \
         --network-configuration 'awsvpcConfiguration={subnets=${jsonencode(aws_subnet.private[*].id)},securityGroups=["${aws_security_group.ecs.id}"]}'
  EOT
}
