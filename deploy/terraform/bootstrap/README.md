# Terraform state bucket bootstrap

This one-time stack creates a private S3 bucket for the ECR and EKS Terraform backends. It enables versioning, server-side encryption, public-access blocks, and bucket-owner-enforced object ownership. Its state starts local; keep the local state file and backup out of source control and in approved encrypted storage.

```powershell
terraform -chdir=deploy/terraform/bootstrap init -backend=false
terraform -chdir=deploy/terraform/bootstrap fmt -check -recursive
terraform -chdir=deploy/terraform/bootstrap validate
terraform -chdir=deploy/terraform/bootstrap plan -var="state_bucket_name=YOUR-GLOBALLY-UNIQUE-STATE-BUCKET"
```

Review the AWS account, region, bucket name, and plan before applying with an authorized AWS identity. The bucket has `prevent_destroy`; state recovery and deletion require a deliberate, separately reviewed process. Configure remote backends for application stacks with the output bucket name and region. Terraform's S3 backend uses an S3 lock file; no DynamoDB lock table is created.
