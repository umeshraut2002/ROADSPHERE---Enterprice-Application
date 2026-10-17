pipeline {
  agent { label 'node22-docker-linux' }

  parameters {
    string(name: 'AWS_REGION', defaultValue: 'eu-central-1', trim: true, description: 'Region containing the ECR repositories and EKS cluster.')
    string(name: 'EKS_CLUSTER_NAME', defaultValue: 'roadsphere-prod', trim: true, description: 'EKS cluster to update when production deployment is approved.')
    booleanParam(name: 'DEPLOY_TO_EKS', defaultValue: false, description: 'Publish a verified main-branch release and request approval to deploy it to EKS.')
  }

  options {
    timestamps()
    disableConcurrentBuilds()
    timeout(time: 30, unit: 'MINUTES')
  }

  environment {
    CI = 'true'
    DOCKER_BUILDKIT = '1'
    AWS_REGION = "${params.AWS_REGION}"
    AWS_DEFAULT_REGION = "${params.AWS_REGION}"
    EKS_CLUSTER_NAME = "${params.EKS_CLUSTER_NAME}"
  }

  stages {
    stage('Check toolchain') {
      steps {
        sh 'node --version'
        sh 'npm --version'
        sh 'mvn --version'
        sh 'aws --version'
        sh 'docker compose version'
        sh 'kubectl version --client'
        sh 'terraform version'
      }
    }

    stage('Validate service catalog') {
      steps {
        sh 'node scripts/validate-service-catalog.mjs'
      }
    }

    stage('Install locked dependencies') {
      steps {
        sh 'npm ci --prefix services/local-demo-api --ignore-scripts --no-audit --no-fund'
        sh 'npm ci --prefix frontends/fleet-operations --ignore-scripts --no-audit --no-fund'
        sh 'npm ci --prefix frontends/customer-portal --ignore-scripts --no-audit --no-fund'
      }
    }

    stage('Verify local API') {
      steps {
        sh 'npm test --prefix services/local-demo-api'
      }
    }

    stage('Verify vehicle registry service') {
      steps {
        sh 'mvn -B -ntp -f services/vehicle-registry-service/pom.xml verify'
      }
    }

    stage('Verify vehicle status service') {
      steps {
        sh 'mvn -B -ntp -f services/vehicle-status-service/pom.xml verify'
      }
    }

    stage('Verify telemetry ingestion service') {
      steps {
        sh 'mvn -B -ntp -f services/telemetry-ingestion-service/pom.xml verify'
      }
    }

    stage('Build and verify fleet portal') {
      steps {
        sh 'npm test --prefix frontends/fleet-operations'
        sh 'npm run build --prefix frontends/fleet-operations'
      }
    }

    stage('Build customer portal') {
      steps {
        sh 'npm test --prefix frontends/customer-portal'
        sh 'npm run build --prefix frontends/customer-portal'
      }
    }

    stage('Smoke test local applications') {
      steps {
        sh 'node scripts/dev.mjs --smoke'
      }
    }

    stage('Validate Terraform') {
      steps {
        sh 'terraform fmt -check -recursive deploy/terraform'
        sh 'terraform -chdir=deploy/terraform/bootstrap init -backend=false -input=false'
        sh 'terraform -chdir=deploy/terraform/bootstrap validate'
        sh 'terraform -chdir=deploy/terraform/ecr init -backend=false -input=false'
        sh 'terraform -chdir=deploy/terraform/ecr validate'
        sh 'terraform -chdir=deploy/terraform/eks init -backend=false -input=false'
        sh 'terraform -chdir=deploy/terraform/eks validate'
      }
    }

    stage('Validate and build local containers') {
      steps {
        sh 'docker compose config --quiet'
        sh 'docker compose build --pull'
      }
    }

    stage('Smoke test local Compose stack') {
      steps {
        sh 'docker compose up --detach'
        sh 'node scripts/compose-smoke.mjs'
      }
      post {
        always {
          sh 'docker compose down --remove-orphans'
        }
      }
    }

    stage('Render Kubernetes manifests') {
      steps {
        sh 'kubectl kustomize deploy/kubernetes/base'
      }
    }

    stage('Publish verified release images to ECR') {
      when { branch 'main' }
      steps {
        script {
          env.AWS_ACCOUNT_ID = sh(returnStdout: true, script: 'aws sts get-caller-identity --query Account --output text').trim()
          env.ECR_REGISTRY = "${env.AWS_ACCOUNT_ID}.dkr.ecr.${env.AWS_REGION}.amazonaws.com"
          env.RELEASE_IMAGE_TAG = "git-${env.GIT_COMMIT.take(12)}-${env.BUILD_NUMBER}"
        }
        sh 'aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"'
        sh '''set -eu
          for image in local-demo-api vehicle-registry-service vehicle-status-service telemetry-ingestion-service fleet-operations customer-portal; do
            docker tag "roadsphere/$image:dev" "$ECR_REGISTRY/roadsphere/$image:$RELEASE_IMAGE_TAG"
            docker push "$ECR_REGISTRY/roadsphere/$image:$RELEASE_IMAGE_TAG"
          done
        '''
      }
    }

    stage('Approve production EKS deployment') {
      when {
        allOf {
          branch 'main'
          expression { params.DEPLOY_TO_EKS }
        }
      }
      steps {
        input message: "Deploy ${env.RELEASE_IMAGE_TAG} to ${env.EKS_CLUSTER_NAME} in ${env.AWS_REGION}?", ok: 'Deploy verified release'
      }
    }

    stage('Deploy release to EKS') {
      when {
        allOf {
          branch 'main'
          expression { params.DEPLOY_TO_EKS }
        }
      }
      steps {
        sh 'aws eks update-kubeconfig --name "$EKS_CLUSTER_NAME" --region "$AWS_REGION"'
        sh 'kubectl -n roadsphere-demo get deployments'
        sh 'node scripts/deploy-kubernetes-release.mjs --apply "$ECR_REGISTRY" "$RELEASE_IMAGE_TAG"'
        sh 'kubectl -n roadsphere-demo rollout status deployment/vehicle-registry-service --timeout=180s'
        sh 'kubectl -n roadsphere-demo rollout status deployment/telemetry-ingestion-service --timeout=180s'
        sh 'kubectl -n roadsphere-demo rollout status deployment/vehicle-status-service --timeout=180s'
        sh 'kubectl -n roadsphere-demo rollout status deployment/local-demo-api --timeout=180s'
        sh 'kubectl -n roadsphere-demo rollout status deployment/fleet-operations --timeout=180s'
        sh 'kubectl -n roadsphere-demo rollout status deployment/customer-portal --timeout=180s'
      }
    }
  }

  post {
    always {
      archiveArtifacts artifacts: 'frontends/customer-portal/dist/**,frontends/fleet-operations/dist/**', allowEmptyArchive: true
    }
  }
}
