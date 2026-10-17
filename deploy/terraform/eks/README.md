# RoadSphere EKS foundation

This stack defines a private Amazon EKS control plane, EC2 managed worker nodes in private subnets, public subnets for a later load balancer, one NAT gateway per Availability Zone, a scoped Jenkins EC2 agent role/profile, and a namespace-scoped EKS access entry. The Jenkins role can push images to the RoadSphere ECR repositories, describe this cluster, and administer Kubernetes resources in `roadsphere-demo`. The role has no static AWS keys.

The default cluster version is `1.37`; check Amazon EKS supported versions in the selected region before applying. Nodes run in private subnets and the Kubernetes API endpoint is private, so deploy commands must run from an EC2 agent or other trusted host with VPC connectivity. The default creates two `m7i.large` On-Demand nodes and one NAT gateway in each of two AZs. These are production-style defaults for the learning stack, not a workload sizing recommendation. Use the AWS Pricing Calculator for the selected region and scale before applying.

## State backend

First create the shared, versioned, encrypted S3 state bucket from `deploy/terraform/bootstrap` using local state. Then initialize this stack with the bucket and region from that bootstrap output:

```powershell
terraform -chdir=deploy/terraform/bootstrap init -backend=false
terraform -chdir=deploy/terraform/bootstrap validate
terraform -chdir=deploy/terraform/bootstrap plan -var="state_bucket_name=YOUR-GLOBALLY-UNIQUE-STATE-BUCKET"
```

Review the bootstrap plan and apply only from an authorized AWS identity. Then initialize the EKS stack using the S3 bucket:

```powershell
terraform -chdir=deploy/terraform/eks init `
  -backend-config="bucket=YOUR-GLOBALLY-UNIQUE-STATE-BUCKET" `
  -backend-config="region=eu-central-1"
terraform -chdir=deploy/terraform/eks fmt -check -recursive
terraform -chdir=deploy/terraform/eks validate
terraform -chdir=deploy/terraform/eks plan -var-file=terraform.tfvars
```

Copy `terraform.tfvars.example` to an untracked `terraform.tfvars` with `Copy-Item deploy/terraform/eks/terraform.tfvars.example deploy/terraform/eks/terraform.tfvars`. Review the selected account, region, Kubernetes version, EC2 type, AZ count, and plan, then apply only after approval. The cluster has deletion protection in Terraform. The EKS API endpoint is private. The creator identity receives bootstrap cluster-admin access; the Jenkins EC2 role receives an EKS `AmazonEKSAdminPolicy` scoped to the application namespace. An administrator must create `roadsphere-demo` once before the namespace-scoped Jenkins role can apply workloads.

The base Terraform stack does not create a production database, DNS records, ACM certificate, AWS Load Balancer Controller, application authentication, or Jenkins controller/agent instances. Those are separate prerequisites before any public production release. The application remains a synthetic learning project and does not yet meet production data or identity requirements.
