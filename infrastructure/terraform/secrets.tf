# ── Application Secrets ───────────────────────────────────────────────────────
# Sensitive env vars for the backend, stored in Secrets Manager and injected
# into ECS containers at runtime (never baked into Docker images).

resource "aws_secretsmanager_secret" "app_secrets" {
  name                    = "${local.name_prefix}/app-secrets"
  description             = "JWT, encryption key, Stripe keys for PromptSense backend"
  recovery_window_in_days = 7

  tags = { Name = "${local.name_prefix}-app-secrets" }
}

resource "aws_secretsmanager_secret_version" "app_secrets" {
  secret_id = aws_secretsmanager_secret.app_secrets.id

  secret_string = jsonencode({
    jwt_secret            = var.jwt_secret
    encryption_key        = var.encryption_key
    stripe_secret_key     = var.stripe_secret_key
    stripe_webhook_secret = var.stripe_webhook_secret
  })
}

# ── Secret Rotation reminder ──────────────────────────────────────────────────
# AWS Secrets Manager can auto-rotate secrets using a Lambda function.
# For the DB password this is straightforward; for the app secrets you need
# custom rotation logic. The resources below are placeholders — uncomment and
# configure once you are ready to enable rotation.

# resource "aws_secretsmanager_secret_rotation" "db_credentials" {
#   secret_id           = aws_secretsmanager_secret.db_credentials.id
#   rotation_lambda_arn = aws_lambda_function.secret_rotation.arn
#
#   rotation_rules {
#     automatically_after_days = 30
#   }
# }
