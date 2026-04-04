# ── ElastiCache Subnet Group ──────────────────────────────────────────────────
resource "aws_elasticache_subnet_group" "main" {
  name        = "${local.name_prefix}-redis-subnet-group"
  subnet_ids  = aws_subnet.private[*].id
  description = "Private subnets for PromptSense Redis"

  tags = { Name = "${local.name_prefix}-redis-subnet-group" }
}

# ── ElastiCache Redis (Serverless for low-ops, or swap to cluster_mode below) ─
# Using a single-node Replication Group for simplicity; add replica_count = 1
# for prod HA (costs double but survives AZ failure automatically).
resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "${local.name_prefix}-redis"
  description          = "PromptSense rate-limit and cache store"

  node_type            = var.redis_node_type
  num_cache_clusters   = 1   # set to 2 for Multi-AZ HA
  port                 = 6379

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  # Encryption in transit + at rest
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true

  # Auth token so only our ECS tasks can connect (stored in Secrets Manager below)
  auth_token = random_password.redis_auth.result

  automatic_failover_enabled = false  # set to true when num_cache_clusters >= 2
  engine_version             = "7.1"

  # Maintenance window
  maintenance_window = "sun:05:00-sun:06:00"

  # Snapshots for recovery
  snapshot_retention_limit = 3
  snapshot_window          = "04:00-05:00"

  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis.name
    destination_type = "cloudwatch-logs"
    log_format       = "text"
    log_type         = "slow-log"
  }

  tags = { Name = "${local.name_prefix}-redis" }
}

resource "random_password" "redis_auth" {
  length  = 32
  special = false # Redis AUTH token cannot contain certain special chars
}

resource "aws_cloudwatch_log_group" "redis" {
  name              = "/aws/elasticache/${local.name_prefix}-redis"
  retention_in_days = 14
}

# ── Store Redis connection string in Secrets Manager ──────────────────────────
resource "aws_secretsmanager_secret" "redis_url" {
  name                    = "${local.name_prefix}/redis-url"
  description             = "ElastiCache Redis connection URL for ECS tasks"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "redis_url" {
  secret_id     = aws_secretsmanager_secret.redis_url.id
  secret_string = "rediss://:${random_password.redis_auth.result}@${aws_elasticache_replication_group.main.primary_endpoint_address}:6379"
}
