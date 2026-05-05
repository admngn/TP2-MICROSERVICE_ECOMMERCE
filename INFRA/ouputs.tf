output "resource_group_name" {
  description = "Resource Group"
  value       = azurerm_resource_group.rg.name
}

output "cluster_name" {
  description = "Nom du cluster AKS"
  value       = azurerm_kubernetes_cluster.aks.name
}

output "kube_config" {
  description = "Kubeconfig pour kubectl"
  value       = azurerm_kubernetes_cluster.aks.kube_config_raw
  sensitive   = true
}

output "cluster_id" {
  description = "ID du cluster"
  value       = azurerm_kubernetes_cluster.aks.id
}

output "cluster_fqdn" {
  description = "FQDN du cluster"
  value       = azurerm_kubernetes_cluster.aks.fqdn
}

output "configure_kubectl" {
  description = "Configuration du kubectl"
  value       = "az aks get-credentials --resource-group ${azurerm_resource_group.rg.name} --name ${azurerm_kubernetes_cluster.aks.name}"
}