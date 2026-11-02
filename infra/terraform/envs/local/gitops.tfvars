env              = "local"
account_id       = "000000000000"
aws_endpoint_url = "http://localhost:4566"

cluster_name                = "cms-local"
aws_endpoint_url_in_cluster = "http://floci:4566"

# Argo CD reads snapshots of the working tree from the local Git mirror (make local-sync);
# `make local-retarget BRANCH=<pushed branch>` switches the cluster to GitHub instead.
gitops_repo_url = "http://172.30.0.11:3000/cms/cms_demo.git"
gitops_revision = "local"
