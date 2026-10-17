output "cluster_name" {
  description = "EKS cluster name. Its Kubernetes endpoint is private to this VPC."
  value       = aws_eks_cluster.application.name
}

output "vpc_id" {
  description = "VPC containing the EKS cluster and private worker nodes."
  value       = aws_vpc.application.id
}

output "private_subnet_ids" {
  description = "Private subnets for EKS worker nodes and internal services."
  value       = aws_subnet.private[*].id
}

output "ci_agent_instance_profile_name" {
  description = "Attach this instance profile to a Jenkins EC2 agent launched in the EKS VPC."
  value       = aws_iam_instance_profile.ci_agent.name
}

output "ci_agent_role_arn" {
  description = "IAM role accepted by the EKS namespace-scoped access entry."
  value       = aws_iam_role.ci_agent.arn
}

output "aws_region" {
  description = "Deployment region."
  value       = data.aws_region.current.name
}
