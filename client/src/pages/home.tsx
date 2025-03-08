import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { insertDeploymentSchema, type InsertDeployment } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ImageIcon, Server, AlertCircle } from "lucide-react";

// Load the Stable Diffusion WebUI YAML config
const WEBUI_CONFIG = `version: "1.0"

services:
  sd-webui:
    image: spheronnetwork/jupyter-notebook:pytorch-2.4.1-cuda-enabled
    pull_policy: IfNotPresent
    expose:
      - port: 7860
        as: 7860
        to:
          - global: true
      - port: 8888
        as: 8888
        to:
          - global: true
    env:
      - JUPYTER_TOKEN=test
      - PYTHONUNBUFFERED=1
    command:
      - "bash"
      - "-c"
      - |
        # Start Jupyter in background with a log file
        jupyter notebook --allow-root --ip=0.0.0.0 --NotebookApp.token=test --no-browser > /tmp/jupyter.log 2>&1 &

        # Make sure we have necessary dependencies
        apt-get update && apt-get install -y git wget libgl1 libglib2.0-0 || true

        # Clone Stable Diffusion WebUI
        cd /home/jovyan
        if [ ! -d "stable-diffusion-webui" ]; then
          git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui.git
        fi
        cd stable-diffusion-webui

        # Create a webui-user.sh file with appropriate settings
        cat > webui-user.sh << 'EOF'
        #!/bin/bash
        export COMMANDLINE_ARGS="--listen --port 7860 --enable-insecure-extension-access"
        export PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512
        EOF
        chmod +x webui-user.sh

        # Launch Stable Diffusion WebUI with logs
        echo "Starting Stable Diffusion WebUI..."
        ./webui.sh > /tmp/webui.log 2>&1 &

        # Give WebUI some time to start
        sleep 10

        # Keep the container running and show logs
        echo "Services started. Container will remain running. View logs with 'tail -f /tmp/webui.log' command."

        # Keep container running
        while true; do
          sleep 60
          echo "Container is running. Stable Diffusion WebUI should be accessible on port 7860."
        done`;

interface BalanceResponse {
  lockedBalance: string;
  unlockedBalance: string;
}

interface DeploymentResponse {
  deployment: {
    id: number;
    name: string;
    status: string;
    webuiUrl?: string;
  };
  transaction: {
    leaseId: string;
  };
  details: {
    status: string;
    provider: string;
    pricePerHour: string;
    startTime: string;
    remainingTime: string;
    forwarded_ports: {
      [key: string]: Array<{
        port: number;
        externalPort: number;
        proto: string;
        name: string;
        host: string;
      }>;
    };
  };
}

export default function Home() {
  const { toast } = useToast();
  const [deploymentInfo, setDeploymentInfo] = useState<DeploymentResponse | null>(null);

  const form = useForm<InsertDeployment>({
    resolver: zodResolver(insertDeploymentSchema),
    defaultValues: {
      name: "stable-diffusion-webui",
      yamlConfig: WEBUI_CONFIG,
    },
  });

  const { data: escrowBalance } = useQuery<BalanceResponse>({
    queryKey: ["/api/balance"],
  });

  const deployMutation = useMutation({
    mutationFn: async (data: InsertDeployment) => {
      const res = await apiRequest("POST", "/api/deployments", data);
      return res.json();
    },
    onSuccess: (data: DeploymentResponse) => {
      setDeploymentInfo(data);
      toast({
        title: "Deployment Created",
        description: "Stable Diffusion WebUI is being deployed. Please wait for the WebUI URL.",
      });
      form.reset();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertDeployment) => {
    deployMutation.mutate(data);
  };

  const getWebuiUrl = () => {
    if (!deploymentInfo?.details?.forwarded_ports?.['sd-webui']) {
      return null;
    }
    const webuiPort = deploymentInfo.details.forwarded_ports['sd-webui'].find(
      p => p.port === 7860
    );
    return webuiPort ? `http://${webuiPort.host}:${webuiPort.externalPort}` : null;
  };

  return (
    <div className="container mx-auto py-10 px-4">
      <h1 className="text-4xl font-bold mb-8">Stable Diffusion Image Generator</h1>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Balance Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {escrowBalance ? (
              <div className="space-y-2">
                <p className="text-lg">
                  Available Balance: {escrowBalance.unlockedBalance} CST
                </p>
                <p className="text-sm text-muted-foreground">
                  Locked in deployments: {escrowBalance.lockedBalance} CST
                </p>
              </div>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Unable to fetch balance. Please ensure you have sufficient CST funds.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Generate Images with Stable Diffusion
            </CardTitle>
          </CardHeader>
          <CardContent>
            {deploymentInfo && getWebuiUrl() ? (
              <div className="space-y-4">
                <Alert>
                  <AlertDescription>
                    Stable Diffusion WebUI is ready! Click the button below to start generating images.
                  </AlertDescription>
                </Alert>
                <Button
                  className="w-full mt-4"
                  onClick={() => {
                    const url = getWebuiUrl();
                    if (url) window.open(url, '_blank');
                  }}
                >
                  Open Stable Diffusion WebUI
                </Button>
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Deployment Name</FormLabel>
                        <FormControl>
                          <Input placeholder="stable-diffusion-webui" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="yamlConfig"
                    render={({ field }) => (
                      <FormItem className="hidden">
                        <FormControl>
                          <Textarea {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    disabled={deployMutation.isPending}
                    className="w-full"
                  >
                    {deployMutation.isPending ? "Deploying Stable Diffusion..." : "Generate Images with Stable Diffusion"}
                  </Button>
                </form>
              </Form>
            )}

            {deploymentInfo && !getWebuiUrl() && (
              <div className="mt-4">
                <Alert>
                  <AlertDescription>
                    Deployment is in progress. The WebUI will be available shortly...
                  </AlertDescription>
                </Alert>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}