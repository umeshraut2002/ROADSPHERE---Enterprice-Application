variable "aws_region" {
  description = "AWS region for RoadSphere infrastructure."
  type        = string
  default     = "eu-central-1"
}

variable "environment" {
  description = "Deployment environment name used in resource tags."
  type        = string
  default     = "production"
}

variable "cluster_name" {
  description = "Amazon EKS cluster name."
  type        = string
  default     = "roadsphere-prod"
}

variable "kubernetes_version" {
  description = "Amazon EKS Kubernetes minor version. Review current support before upgrades."
  type        = string
  default     = "1.37"
}

variable "vpc_cidr" {
  description = "IPv4 range for the dedicated EKS VPC."
  type        = string
  default     = "10.40.0.0/16"
}

variable "availability_zone_count" {
  description = "Number of Availability Zones for public and private subnets."
  type        = number
  default     = 2

  validation {
    condition     = var.availability_zone_count >= 2 && var.availability_zone_count <= 3 && var.availability_zone_count == floor(var.availability_zone_count)
    error_message = "availability_zone_count must be 2 or 3."
  }
}

variable "node_instance_types" {
  description = "EC2 instance types for the EKS managed node group."
  type        = list(string)
  default     = ["m7i.large"]

  validation {
    condition     = length(var.node_instance_types) > 0
    error_message = "node_instance_types must include at least one EC2 instance type."
  }
}

variable "node_min_size" {
  description = "Minimum EC2 node count in the managed node group."
  type        = number
  default     = 2
}

variable "node_desired_size" {
  description = "Initial EC2 node count in the managed node group."
  type        = number
  default     = 2
}

variable "node_max_size" {
  description = "Maximum EC2 node count in the managed node group."
  type        = number
  default     = 4
}

variable "ci_agent_role_name" {
  description = "IAM role and instance profile name for a Jenkins EC2 agent inside the VPC."
  type        = string
  default     = "roadsphere-jenkins-agent"
}

variable "application_namespace" {
  description = "Namespace in which the Jenkins deployment role may manage workloads."
  type        = string
  default     = "roadsphere-demo"
}
