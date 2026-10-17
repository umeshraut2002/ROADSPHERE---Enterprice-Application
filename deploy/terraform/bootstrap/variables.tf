variable "aws_region" {
  description = "AWS region where the Terraform state bucket is created."
  type        = string
  default     = "eu-central-1"
}

variable "state_bucket_name" {
  description = "Globally unique S3 bucket name for encrypted, versioned Terraform state."
  type        = string

  validation {
    condition     = length(var.state_bucket_name) >= 3 && length(var.state_bucket_name) <= 63 && can(regex("^[a-z0-9][a-z0-9.-]+[a-z0-9]$", var.state_bucket_name))
    error_message = "state_bucket_name must be a valid 3-63 character lowercase S3 bucket name."
  }
}
