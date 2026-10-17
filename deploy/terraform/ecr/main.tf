locals {
  repositories = toset([
    "roadsphere/local-demo-api",
    "roadsphere/vehicle-registry-service",
    "roadsphere/vehicle-status-service",
    "roadsphere/telemetry-ingestion-service",
    "roadsphere/fleet-operations",
    "roadsphere/customer-portal",
  ])
}

resource "aws_ecr_repository" "application" {
  for_each = local.repositories

  name                 = each.value
  image_tag_mutability = "IMMUTABLE"
  force_delete         = false

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name      = each.value
    Component = basename(each.value)
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_ecr_lifecycle_policy" "application" {
  for_each = local.repositories

  repository = aws_ecr_repository.application[each.key].name
  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged learning images after the configured age"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = var.untagged_image_expiry_days
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Retain only the configured number of recent images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = var.image_keep_count
        }
        action = { type = "expire" }
      }
    ]
  })
}
