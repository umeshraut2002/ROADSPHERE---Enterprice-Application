# RoadSphere ECR image repositories

This small Terraform stack provisions private Amazon ECR repositories for the local learning images, including the vehicle registry service. It does not create compute, networking, a database, or AWS credentials. Repositories are private, encrypted with AES-256, scan on push, reject mutable tags, and retain a bounded image history.

Repository deletion is protected by Terraform `prevent_destroy` and ECR `force_delete = false`. Review and remove those guards deliberately only when an approved teardown is intended. Lifecycle policies expire untagged images after seven days and retain ten recent images by default. Use unique commit tags; do not push the same tag twice.

## Review the plan

This stack uses the shared S3 backend created by [the Terraform bootstrap](../bootstrap/README.md). Keep the bootstrap stack's initial local state and all credentials out of source control. The example variables are optional; all defaults are learning settings.

```powershell
terraform -chdir=deploy/terraform/ecr init `
  -backend-config="bucket=YOUR-GLOBALLY-UNIQUE-STATE-BUCKET" `
  -backend-config="region=eu-central-1"
terraform -chdir=deploy/terraform/ecr validate
terraform -chdir=deploy/terraform/ecr plan -out=roadsphere-ecr.tfplan
```

Inspect the saved plan and its account/region before any `terraform apply`. Applying creates private ECR repositories; charges depend on stored image data and data transfer. There is no compute cost in this stack. Check the [AWS ECR pricing page](https://aws.amazon.com/ecr/pricing/) for current rates and use the AWS Pricing Calculator for a workload estimate.

## Publish images

After an approved repository setup, authenticate Docker to the registry using an AWS CLI profile or short-lived CI role. Build and push commit-tagged images to the output URLs. Do not place AWS keys in this repository, a Dockerfile, Jenkinsfile, or a `VITE_*` variable. CI image publishing is not enabled until an ECR role and registry workflow are configured.
