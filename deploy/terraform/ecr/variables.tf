variable "aws_region" {
  description = "AWS region for the private container repositories."
  type        = string
  default     = "eu-central-1"

  validation {
    condition     = length(trimspace(var.aws_region)) > 0
    error_message = "aws_region must not be empty."
  }
}

variable "image_keep_count" {
  description = "Maximum number of recent images to retain in each repository."
  type        = number
  default     = 10

  validation {
    condition     = var.image_keep_count >= 2 && var.image_keep_count <= 100 && var.image_keep_count == floor(var.image_keep_count)
    error_message = "image_keep_count must be a whole number between 2 and 100."
  }
}

variable "untagged_image_expiry_days" {
  description = "Days before untagged images become eligible for lifecycle cleanup."
  type        = number
  default     = 7

  validation {
    condition     = var.untagged_image_expiry_days >= 1 && var.untagged_image_expiry_days <= 90 && var.untagged_image_expiry_days == floor(var.untagged_image_expiry_days)
    error_message = "untagged_image_expiry_days must be a whole number between 1 and 90."
  }
}
