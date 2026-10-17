terraform {
  backend "s3" {
    key          = "roadsphere/production/eks.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}
