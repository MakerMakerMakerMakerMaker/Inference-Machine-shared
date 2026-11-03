variable "project_id" {
  type        = string
  description = "GCP project that will own the service, the bucket, and the Firestore database."
}

variable "region" {
  type        = string
  default     = "us-central1"
  description = "Cloud Run, Artifact Registry, bucket, and Firestore region."
}

variable "domain" {
  type        = string
  description = "Public host for the FastAPI service, mapped onto Cloud Run."
}

variable "dns_managed_zone" {
  type        = string
  default     = ""
  description = "Cloud DNS zone in project_id whose apex is domain. Empty skips the DNS records."
}

variable "dns_records" {
  type        = map(list(string))
  default     = {}
  description = "Records to write at the zone apex, by type, e.g. { A = [...], AAAA = [...] }. Used only with dns_managed_zone."
}

variable "trajectory_days" {
  type        = number
  default     = 90
  description = "Days an uploaded trajectory is kept in the bucket before it is deleted."
}

variable "sentry_dsn" {
  type        = string
  default     = ""
  sensitive   = true
  description = "Sentry DSN for the FastAPI service, stored in Secret Manager. Empty leaves Sentry off."
}

variable "image_tag" {
  type        = string
  default     = "latest"
  description = "Tag in the inference-game Artifact Registry repository. ./build.sh --push publishes latest."
}
