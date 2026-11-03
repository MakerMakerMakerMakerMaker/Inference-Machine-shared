# Leaderboard and the game, on one Cloud Run service.
#
# The image is built on your machine, not by Cloud Build. From the repo root:
#   ./build.sh --push --project YOUR_PROJECT
# Then, from this directory, with your values in terraform.tfvars (start from
# terraform.tfvars.example):
#   terraform init
#   terraform apply
#
# The first apply can create the registry before the image exists:
#   terraform apply -target=google_artifact_registry_repository.app
# Push, then apply again.
#
# Apply maps var.domain onto the Cloud Run service and, when dns_managed_zone
# is set, writes dns_records at the apex of that zone.

data "google_project" "current" {}

locals {
  image_registry = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.app.repository_id}"
  image          = "${local.image_registry}/api:${var.image_tag}"
  run_robot      = "serviceAccount:service-${data.google_project.current.number}@serverless-robot-prod.iam.gserviceaccount.com"
  sentry_enabled = nonsensitive(var.sentry_dsn != "")
}

resource "google_project_service" "run" {
  service            = "run.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "artifactregistry" {
  service            = "artifactregistry.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "firestore" {
  service            = "firestore.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "storage" {
  service            = "storage.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "dns" {
  service            = "dns.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "secretmanager" {
  service            = "secretmanager.googleapis.com"
  disable_on_destroy = false
}

resource "google_service_account" "run" {
  account_id   = "inference-game"
  display_name = "Inference game leaderboard"
}

# Signed URLs are signed with IAM, because Cloud Run has no private key.
resource "google_service_account_iam_member" "signer" {
  service_account_id = google_service_account.run.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.run.email}"
}

resource "google_project_iam_member" "firestore" {
  project    = var.project_id
  role       = "roles/datastore.user"
  member     = "serviceAccount:${google_service_account.run.email}"
  depends_on = [google_project_service.firestore]
}

resource "google_firestore_database" "kv" {
  name        = "inference-game"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"
  depends_on  = [google_project_service.firestore]
}

resource "google_firestore_field" "upload_expiry" {
  project    = var.project_id
  database   = google_firestore_database.kv.name
  collection = "uploads"
  field      = "expires"
  ttl_config {}
}

resource "google_storage_bucket" "trajectories" {
  name                        = "${var.project_id}-inference-trajectories"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  # The browser PUTs the file itself. The signed header below is what
  # enforces the 1 MB cap; CORS only lets the page send that header.
  cors {
    origin          = ["*"]
    method          = ["PUT", "OPTIONS"]
    response_header = ["Content-Type", "x-goog-content-length-range"]
    max_age_seconds = 3600
  }

  # Anyone can ask for an upload URL, so trajectories are not kept forever.
  # A failed claim's file must be reviewed before this age.
  lifecycle_rule {
    condition {
      age = var.trajectory_days
    }
    action {
      type = "Delete"
    }
  }

  depends_on = [google_project_service.storage]
}

resource "google_storage_bucket_iam_member" "run" {
  bucket = google_storage_bucket.trajectories.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.run.email}"
}

# The DSN is written to the state when sentry_dsn is set. Without it the
# service runs with Sentry off.
resource "google_secret_manager_secret" "sentry_dsn" {
  secret_id = "inference-game-sentry-dsn"

  replication {
    auto {}
  }

  depends_on = [google_project_service.secretmanager]
}

resource "google_secret_manager_secret_version" "sentry_dsn" {
  count       = local.sentry_enabled ? 1 : 0
  secret      = google_secret_manager_secret.sentry_dsn.id
  secret_data = var.sentry_dsn
}

resource "google_secret_manager_secret_iam_member" "sentry_dsn" {
  secret_id = google_secret_manager_secret.sentry_dsn.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.run.email}"
}

resource "google_artifact_registry_repository" "app" {
  location      = var.region
  repository_id = "inference-game"
  description   = "Container images for the inference game."
  format        = "DOCKER"
  depends_on    = [google_project_service.artifactregistry]
}

resource "google_artifact_registry_repository_iam_member" "run_reader" {
  location   = var.region
  repository = google_artifact_registry_repository.app.repository_id
  role       = "roles/artifactregistry.reader"
  member     = local.run_robot
  depends_on = [google_project_service.run]
}

# :latest does not change between pushes, so Cloud Run would keep the old
# revision. Read the digest and stamp it on the template.
data "external" "image_digest" {
  program = ["bash", "-c", <<-EOT
    DIGEST=$(gcloud artifacts docker images describe ${local.image} --format='get(image_summary.digest)' 2>/dev/null || echo "$(date +%s)")
    echo "{\"digest\":\"$DIGEST\"}"
  EOT
  ]
}

resource "google_cloud_run_v2_service" "api" {
  provider = google-beta
  name     = "inference-game"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"
  # Public site. IAP is off, and the invoker IAM check is disabled so
  # anonymous callers are not rejected before the container runs.
  # iap_enabled is still a beta field, so the service stays on the beta API.
  launch_stage         = "BETA"
  iap_enabled          = false
  invoker_iam_disabled = true

  template {
    annotations = {
      "image-digest"                      = data.external.image_digest.result.digest
      "run.googleapis.com/cpu-throttling" = "false"
    }
    service_account                  = google_service_account.run.email
    timeout                          = "120s"
    max_instance_request_concurrency = 1
    scaling {
      min_instance_count = 1
      max_instance_count = 10
    }
    containers {
      image = local.image
      ports {
        container_port = 8080
      }
      resources {
        limits = {
          cpu    = "2"
          memory = "2Gi"
        }
      }
      env {
        name  = "BUCKET"
        value = google_storage_bucket.trajectories.name
      }
      env {
        name  = "FIRESTORE_DATABASE"
        value = google_firestore_database.kv.name
      }
      dynamic "env" {
        for_each = local.sentry_enabled ? [1] : []
        content {
          name = "SENTRY_DSN"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.sentry_dsn.secret_id
              version = google_secret_manager_secret_version.sentry_dsn[0].version
            }
          }
        }
      }
      # Replay reads /app/public/engine.js from the Vite build. No path override.
    }
  }

  depends_on = [
    google_project_service.run,
    google_storage_bucket_iam_member.run,
    google_project_iam_member.firestore,
    google_service_account_iam_member.signer,
    google_secret_manager_secret_iam_member.sentry_dsn,
  ]
}

# The hostname is a Cloud Run domain mapping, which is what the console lists
# under Custom domains.
resource "google_cloud_run_domain_mapping" "api" {
  name     = var.domain
  location = var.region
  project  = var.project_id

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.api.name
  }

  depends_on = [google_cloud_run_v2_service.api]
}

data "google_dns_managed_zone" "game" {
  count   = var.dns_managed_zone == "" ? 0 : 1
  name    = var.dns_managed_zone
  project = var.project_id
}

# When domain is the apex of its own zone but a subdomain of a larger one,
# Cloud Run only returns a CNAME for it, and Cloud DNS rejects a CNAME at the
# apex. dns_records gives the A/AAAA records to write instead: Cloud Run's
# domain-mapping addresses, listed in terraform.tfvars.example.
resource "google_dns_record_set" "api" {
  for_each = var.dns_managed_zone == "" ? {} : var.dns_records

  name         = data.google_dns_managed_zone.game[0].dns_name
  type         = each.key
  ttl          = 300
  managed_zone = data.google_dns_managed_zone.game[0].name
  project      = var.project_id
  rrdatas      = each.value
}
