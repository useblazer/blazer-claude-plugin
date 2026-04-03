provider "aws" {
  region = "us-east-1"
}

resource "aws_ecs_service" "app" {
  name = "sample-app"
}

resource "aws_db_instance" "main" {
  engine         = "postgres"
  engine_version = "16"
  instance_class = "db.t3.micro"
}
