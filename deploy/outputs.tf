output "service_url" {
  value = "https://${var.domain}"
}

output "cloudrun_service_url" {
  value = google_cloud_run_v2_service.api.uri
}

output "domain_mapping_status" {
  value = try(google_cloud_run_domain_mapping.api.status[0].conditions[0].message, "Domain mapping not ready")
}

output "domain_mapping_records" {
  value = try([
    for record in google_cloud_run_domain_mapping.api.status[0].resource_records : {
      type = record.type
      name = record.name
      data = record.rrdata
    }
  ], [])
}

output "image_registry" {
  value = local.image_registry
}

output "image" {
  value = local.image
}

output "image_digest" {
  value = data.external.image_digest.result.digest
}

output "firestore_database" {
  value = google_firestore_database.kv.name
}
