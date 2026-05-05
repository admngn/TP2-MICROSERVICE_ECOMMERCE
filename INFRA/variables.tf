variable "resource_group_name" {
  description = "Nom du resource group"
  type        = string
  default     = "rg-aks-gitops-prod-we"
}

variable "location" {
  description = "Région Azure"
  type        = string
  default     = "francecentral"
}

variable "cluster_name" {
  description = "Nom du cluster AKS"
  type        = string
  default     = "aks-francecentral-prod-01"
}

variable "node_count" {
  description = "Nombre de nodes initial"
  type        = number
  default     = 1
}

variable "vm_size" {
  description = "Taille des VMs nodes"
  type        = string
  default     = "Standard_B2s"
}


variable "environment" {
  description = "Environnement"
  type        = string
  default     = "prod"
}

variable "project" {
  description = "Nom du projet"
  type        = string
  default     = "gitops-argocd"
}