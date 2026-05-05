output "resource_group_name" {
  value = azurerm_resource_group.rg.name
}

output "vm_public_ip" {
  value = azurerm_public_ip.pip.ip_address
}

output "ssh_command" {
  value = "ssh ${var.admin_username}@${azurerm_public_ip.pip.ip_address}"
}

output "front_url" {
  value = "http://${azurerm_public_ip.pip.ip_address}:8080"
}

output "grafana_url" {
  value = "http://${azurerm_public_ip.pip.ip_address}:3000"
}

output "prometheus_url" {
  value = "http://${azurerm_public_ip.pip.ip_address}:9090"
}
