output "state_bucket_name" {
  description = "S3 bucket name to provide to the application Terraform backends."
  value       = aws_s3_bucket.terraform_state.id
}

output "aws_region" {
  description = "Region containing the state bucket."
  value       = var.aws_region
}
