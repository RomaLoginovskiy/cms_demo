variable "zone_name" {
  description = "Public hosted zone that will contain the hostname (for example dev.example.com)"
  type        = string
}

variable "hostname" {
  description = "Public hostname of the environment (for example cms-dev.example.com); external-dns creates its record"
  type        = string
}

variable "create_zone" {
  description = "Create the zone instead of looking up an existing one (delegate its NS records yourself)"
  type        = bool
  default     = false
}

variable "tags" {
  description = "Tags applied to every resource"
  type        = map(string)
  default     = {}
}
