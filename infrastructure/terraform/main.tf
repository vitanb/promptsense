terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  # Remote state — replace bucket/key/region before first apply
  backend "s3" {
    bucket         = "promptsense-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "promptsense-terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "PromptSense"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# Secondary provider for us-east-1 — required for CloudFront ACM certs
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "PromptSense"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# ── Shared random suffix (keeps names unique per workspace) ───────────────────
resource "random_id" "suffix" {
  byte_length = 4
}

locals {
  name_prefix = "ps-${var.environment}"
  az_count    = 2
}
