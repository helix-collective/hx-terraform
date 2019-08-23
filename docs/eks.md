The aws library can setup Amazon Elastic Kubnernetes Service (EKS) clusters

The setup was modelled on this terraform example:

   https://learn.hashicorp.com/terraform/aws/eks-intro

Basically, to create a cluster. Call `eks::createEksCluster()`. You can customize the
underlying autoscaling group and the worker node EC2 instances via the parameters.

Once deployed, some manual steps are required. To access the cluster you will need to
configure kubectrl by running

```
export AWS_DEFAULT_REGION=...
aws eks update-kubeconfig --name EKS_CLUSTER_NAME
```

You also need to configure the kubernetes system to allow the worker nodes to join
the cluster. The terraform generates an output that needs to be loaded as a kubernetes
config map:

1) Create a directory to hold cluster specific k8s configuration:

```
mkdir -p k8s/$CLUSTERNAME
```

2) Write the auth configmap:

```
 ./tools/run-terraform output eksdemo_k8s_authoutput > k8s/$CLUSTERNAME/config_map_aws_auth.yaml
```

3) Upload the configmap:

```
kubectl apply -f k8s/eksdemo/config_map_aws_auth.yaml 
```

