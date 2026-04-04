# ── RDS Subnet Group ──────────────────────────────────────────────────────────
resource "aws_db_subnet_group" "main" {
  name        = "${local.name_prefix}-db-subnet-group"
  subnet_ids  = aws_subnet.db[*].id
  description = "Isolated subnets for PromptSense RDS"

  tags = { Name = "${local.name_prefix}-db-subnet-group" }
}

# ── RDS Parameter Group ───────────────────────────────────────────────────────
resource "aws_db_parameter_group" "postgres" {
  name        = "${local.name_prefix}-pg16"
  family      = "postgres16"
  description = "PromptSense PostgreSQL 16 parameters"

  # Force SSL connections
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  # Log slow queries (>500ms) for performance tuning
  parameter {
    name  = "log_min_duration_statement"
    value = "500"
  }

  # Log all connections for audit trail
  parameter {
    name  = "log_connections"
    value = "1"
  }

  tags = { Name = "${local.name_prefix}-pg16-params" }
}

# ── RDS Master Password (auto-generated, stored in Secrets Manager) ───────────
resource "random_password" "db" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# ── RDS PostgreSQL Instance ───────────────────────────────────────────────────
resource "aws_db_instance" "main" {
  identifier        = "${local.name_prefix}-postgres"
  engine            = "postgres"
  engine_version    = "16.3"
  instance_class    = var.db_instance_class
  allocated_storage = var.db_allocated_storage
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = var.db_name
  username = var.db_username
  password = random_password.db.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  parameter_group_name   = aws_db_parameter_group.postgres.name

  multi_az               = var.db_multi_az
  publicly_accessible    = false
  deletion_protection    = true
  skip_final_snapshot    = false
  final_snapshot_identifier = "${local.name_prefix}-postgres-final-${random_id.suffix.hex}"

  backup_retention_period = var.db_backup_retention_days
  backup_window           = "03:00-04:00"     # UTC — 11pm-midnight ET
  maintenance_window      = "Mon:04:00-05:00" # UTC — after backup

  # Performance Insights for query-level monitoring (free tier: 7 days)
  performance_insights_enabled          = true
  performance_insights_retention_period = 7

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  auto_minor_version_upgrade = true

  tags = { Name = "${local.name_prefix}-postgres" }
}

# ── Store DB credentials in Secrets Manager ───────────────────────────────────
resource "aws_secretsmanager_secret" "db_credentials" {
  name                    = "${local.name_prefix}/db-credentials"
  description             = "RDS PostgreSQL master credentials"
  recovery_window_in_days = 7

  tags = { Name = "${local.name_prefix}-db-credentials" }
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = var.db_username
    password = random_password.db.result
    host     = aws_db_instance.main.address
    port     = aws_db_instance.main.port
    dbname   = var.db_name
    url      = "postgresql://${var.db_username}:${random_password.db.result}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${var.db_name}?sslmode=require"
  })
}
