variable "resource_group_name" {
  type = string
  default = "rg-vm-ecommerce-prod-01"
}

variable "location" {
  type = string
  default = "germanywestcentral"
}

variable "vm_name" {
  type = string
  default = "vm-devshop-prod-01"
}

variable "vm_size" {
  type = string
  default = "Standard_B2s"
}

variable "admin_username" {
  type = string
  default = "azureuser"
}

variable "ssh_public_key_path" {
  type = string
  default = "~/.ssh/id_rsa.pub"
}
