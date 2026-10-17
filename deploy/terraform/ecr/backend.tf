terraform {
  backend "s3" {
    key          = "roadsphere/production/ecr.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}
