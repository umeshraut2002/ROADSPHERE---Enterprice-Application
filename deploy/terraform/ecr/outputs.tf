output "repository_urls" {
  description = "Private ECR image repository URLs keyed by repository name."
  value = {
    for name, repository in aws_ecr_repository.application : name => repository.repository_url
  }
}

output "registry_id" {
  description = "AWS account registry ID that owns the repositories."
  value       = aws_ecr_repository.application["roadsphere/local-demo-api"].registry_id
}
