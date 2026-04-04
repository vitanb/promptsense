variable "aws_region" {
  description = "AWS region for all resources (except CloudFront ACM, which is always us-east-1)"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["production", "staging"], var.environment)
    error_message = "Must be 'production' or 'staging'."
  }
}

# ── Domain ────────────────────────────────────────────────────────────────────
variable "domain_name" {
  description = "Root domain (e.g. promptsense.io). A hosted zone must already exist in Route 53."
  type        = string
}

variable "app_subdomain" {
  description = "Subdomain for the frontend app"
  type        = string
  default     = "app"
}

variable "api_subdomain" {
  description = "Subdomain for the backend API"
  type        = string
  default     = "api"
}

# ── Networking ────────────────────────────────────────────────────────────────
variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets (one per AZ)"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets (one per AZ)"
  type        = list(string)
  default     = ["10.0.10.0/24", "10.0.11.0/24"]
}

variable "db_subnet_cidrs" {
  description = "CIDR blocks for isolated DB subnets (one per AZ)"
  type        = list(string)
  default     = ["10.0.20.0/24", "10.0.21.0/24"]
}

# ── ECS / Backend ─────────────────────────────────────────────────────────────
variable "backend_image" {
  description = "Full ECR image URI for the backend (set by CI/CD)"
  type        = string
  default     = ""
}

variable "backend_cpu" {
  description = "vCPU units for backend task (256 = 0.25 vCPU)"
  type        = number
  default     = 512
}

variable "backend_memory" {
  description = "Memory (MiB) for backend task"
  type        = number
  default     = 1024
}

variable "backend_desired_count" {
  description = "Number of backend task replicas"
  type        = number
  default     = 2
}

variable "backend_port" {
  description = "Port the backend container listens on"
  type        = number
  default     = 4000
}

# ── RDS ───────────────────────────────────────────────────────────────────────
variable "db_instance_class" {
  description = "RDS instance type"
  type        = string
  default     = "db.t4g.micro"
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "promptsense"
}

variable "db_username" {
  description = "PostgreSQL master username"
  type        = string
  default     = "psadmin"
  sensitive   = true
}

variable "db_multi_az" {
  description = "Enable RDS Multi-AZ for high availability (recommended for production)"
  type        = bool
  default     = true
}

variable "db_allocated_storage" {
  description = "Initial RDS storage in GiB"
  type        = number
  default     = 20
}

variable "db_backup_retention_days" {
  description = "Days to retain automated RDS backups"
  type        = number
  default     = 7
}

# ── ElastiCache ───────────────────────────────────────────────────────────────
variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t4g.micro"
}

# ── Secrets (passed in at apply time or via CI/CD secrets) ────────────────────
variable "jwt_secret" {
  description = "JWT signing secret (min 32 chars)"
  type        = string
  sensitive   = true
}

variable "encryption_key" {
  description = "AES-256 key for encrypting stored provider API keys (exactly 32 chars)"
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.encryption_key) == 32
    error_message = "ENCRYPTION_KEY must be exactly 32 characters for AES-256."
  }
}

variable "stripe_secret_key" {
  description = "Stripe secret key (sk_live_...)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "stripe_webhook_secret" {
  description = "Stripe webhook endpoint secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "frontend_url" {
  description = "Public URL of the frontend (used for CORS). Defaults to https://app.<domain>"
  type        = string
  default     = ""
}
