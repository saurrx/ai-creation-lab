import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { insertDeploymentSchema, type InsertDeployment } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormField, FormItem, FormLabel, FormControl } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ImageIcon, Video, Terminal, Loader2 } from "lucide-react";

// Load YAML configurations from uploaded files
const WEBUI_YAML = `version: "1.0"

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
          # Print a periodic marker to stdout to keep container active
          echo "Container is running. Stable Diffusion WebUI should be accessible on port 7860."
        done

profiles:
  name: stable-diffusion-webui
  duration: 1h
  mode: provider
  compute:
    sd-webui:
      resources:
        cpu:
          units: 16
        memory:
          size: 64Gi
        storage:
          size: 500Gi
        gpu:
          units: 1
          attributes:
            vendor:
              nvidia:
                - model: rtx6000-ada
  placement:
    westcoast:
      attributes:
      pricing:
        sd-webui:
          token: CST
          amount: 15

deployment:
  sd-webui:
    westcoast:
      profile: sd-webui
      count: 1`;
const WAN_YAML = `version: "1.0"

services:
  wan-gradio:
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
        pip install --upgrade pip

        # Clone Wan2.1 repository if it doesn't exist
        cd /home/jovyan
        if [ ! -d "Wan2.1" ]; then
          git clone https://github.com/Wan-Video/Wan2.1.git
        fi
        cd Wan2.1

        # Install dependencies
        pip install -r requirements.txt

        # Download the model if it doesn't exist
        if [ ! -d "Wan2.1-T2V-1.3B" ]; then
          pip install "huggingface_hub[cli]"
          huggingface-cli download Wan-AI/Wan2.1-T2V-1.3B --local-dir ./Wan2.1-T2V-1.3B

          # Make sure the directory structure is correct
          mkdir -p gradio/Wan2.1-T2V-1.3B

          # Create symbolic links to the model files to ensure they're accessible from both locations
          ln -sf /home/jovyan/Wan2.1/Wan2.1-T2V-1.3B/* /home/jovyan/Wan2.1/gradio/Wan2.1-T2V-1.3B/
        fi

        # Modify the gradio script to get the correct model path and port
        cd /home/jovyan/Wan2.1/gradio
        sed -i 's/server_port=7860/server_port=7860/g' t2v_1.3B_singleGPU.py

        # Launch the Gradio interface with absolute paths to avoid confusion
        echo "Starting Wan2.1 Gradio interface..."
        python t2v_1.3B_singleGPU.py --ckpt_dir /home/jovyan/Wan2.1/Wan2.1-T2V-1.3B --prompt_extend_method 'local_qwen' > /tmp/gradio.log 2>&1 &

        # Tail the log file to see any errors
        tail -f /tmp/gradio.log &

        # Keep the container running and show logs
        echo "Services started. Container will remain running."
        echo "Jupyter is accessible on port 8888 with token 'test'"
        echo "Wan2.1 Gradio interface should be accessible on port 7860"

        # Keep container running
        while true; do
          sleep 60
          # Print a periodic marker to stdout to keep container active
          echo "Container is running. Wan2.1 Gradio interface should be accessible on port 7860."
        done

profiles:
  name: wan-gradio
  duration: 1h
  mode: provider
  compute:
    wan-gradio:
      resources:
        cpu:
          units: 16
        memory:
          size: 64Gi
        storage:
          size: 500Gi
        gpu:
          units: 1
          attributes:
            vendor:
              nvidia:
                - model: rtx6000-ada
  placement:
    westcoast:
      attributes:
      pricing:
        wan-gradio:
          token: CST
          amount: 15

deployment:
  wan-gradio:
    westcoast:
      profile: wan-gradio
      count: 1`;

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
    logs: string[];
  };
}

export default function Home() {
  const { toast } = useToast();
  const [deploymentInfo, setDeploymentInfo] = useState<DeploymentResponse | null>(null);
  const [isServiceReady, setIsServiceReady] = useState(false);
  const [pingLogs, setPingLogs] = useState<string[]>([]);

  // Forms for both image and video generation
  const imageForm = useForm<InsertDeployment>({
    resolver: zodResolver(insertDeploymentSchema),
    defaultValues: {
      name: "stable-diffusion-webui",
      yamlConfig: WEBUI_YAML,
    },
  });

  const videoForm = useForm<InsertDeployment>({
    resolver: zodResolver(insertDeploymentSchema),
    defaultValues: {
      name: "wan-gradio",
      yamlConfig: WAN_YAML,
    },
  });

  const deployMutation = useMutation({
    mutationFn: async (data: InsertDeployment) => {
      const res = await apiRequest("POST", "/api/deployments", data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create deployment");
      }
      return res.json();
    },
    onSuccess: (data: DeploymentResponse) => {
      setDeploymentInfo(data);
      setIsServiceReady(false);
      setPingLogs([]);
      toast({
        title: "🚀 Deployment Started",
        description: "We're firing up your AI service. This might take a few minutes...",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "❌ Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getWebuiUrl = () => {
    try {
      if (!deploymentInfo?.details?.forwarded_ports) return null;

      const serviceName = deploymentInfo.deployment.name.includes('wan') ? 'wan-gradio' : 'sd-webui';
      const ports = deploymentInfo.details.forwarded_ports[serviceName];

      if (!ports) return null;

      const webuiPort = ports.find(p => p.port === 7860);
      return webuiPort ? `http://${webuiPort.host}:${webuiPort.externalPort}` : null;
    } catch (error) {
      console.error('Error getting WebUI URL:', error);
      return null;
    }
  };

  // Check service availability
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (deploymentInfo && !isServiceReady) {
      const checkService = async () => {
        const url = getWebuiUrl();
        if (!url) return;

        try {
          const timestamp = new Date().toLocaleTimeString();
          setPingLogs(prev => [...prev, `${timestamp} Checking service status...`]);

          const response = await fetch(url);
          if (response.ok) {
            setIsServiceReady(true);
            setPingLogs(prev => [...prev, `${timestamp} Service is ready! 🎉`]);
            toast({
              title: "🎨 Ready to Create!",
              description: "Your AI service is now live. Click 'Open WebUI' to start generating!",
            });
            if (intervalId) clearInterval(intervalId);
          }
        } catch (error) {
          const timestamp = new Date().toLocaleTimeString();
          setPingLogs(prev => [
            ...prev, 
            `${timestamp} Service still initializing... (${error instanceof Error ? error.message : 'Network error'})`
          ]);
        }
      };

      // Initial check
      checkService();
      // Check every 5 seconds
      intervalId = setInterval(checkService, 5000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [deploymentInfo, isServiceReady]);

  return (
    <div className="container mx-auto py-10 px-4 bg-zinc-100 min-h-screen">
      <h1 className="text-6xl font-black mb-4 text-zinc-900 tracking-tight">AI Creation Lab</h1>
      <p className="text-xl mb-8 text-zinc-600">Transform your ideas into stunning visuals with the power of AI</p>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Image Generation Section */}
        <Card className="border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <ImageIcon className="h-6 w-6" />
              Generate Images
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-zinc-600">Create stunning images from text descriptions using Stable Diffusion</p>
            <Form {...imageForm}>
              <form onSubmit={imageForm.handleSubmit((data) => deployMutation.mutate(data))} className="space-y-6">
                <FormField
                  control={imageForm.control}
                  name="yamlConfig"
                  render={({ field }) => (
                    <FormItem className="hidden">
                      <FormControl>
                        <Input type="hidden" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  disabled={deployMutation.isPending}
                  className="w-full bg-black hover:bg-zinc-800 text-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none"
                >
                  {deployMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Deploying Stable Diffusion...
                    </span>
                  ) : (
                    "🎨 Generate Images with Stable Diffusion"
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Video Generation Section */}
        <Card className="border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Video className="h-6 w-6" />
              Generate Videos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-zinc-600">Transform your text into amazing videos with Wan AI</p>
            <Form {...videoForm}>
              <form onSubmit={videoForm.handleSubmit((data) => deployMutation.mutate(data))} className="space-y-6">
                <FormField
                  control={videoForm.control}
                  name="yamlConfig"
                  render={({ field }) => (
                    <FormItem className="hidden">
                      <FormControl>
                        <Input type="hidden" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  disabled={deployMutation.isPending}
                  className="w-full bg-black hover:bg-zinc-800 text-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none"
                >
                  {deployMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Deploying Wan...
                    </span>
                  ) : (
                    "🎬 Generate Videos with Wan"
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>

      {/* Terminal-style Deployment Info */}
      {deploymentInfo && (
        <Card className="mt-8 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-black text-green-400 font-mono">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl text-green-400">
              <Terminal className="h-5 w-5" />
              Deployment Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p>$ Deployment ID: {deploymentInfo.deployment.id}</p>
              <p>$ Status: {deploymentInfo.details.status}</p>
              <p>$ Provider: {deploymentInfo.details.provider}</p>
              <p>$ Started: {new Date(deploymentInfo.details.startTime).toLocaleString()}</p>
              <p>$ Remaining Time: {deploymentInfo.details.remainingTime}</p>
            </div>

            {getWebuiUrl() ? (
              <div className="space-y-4">
                <p className="text-green-400">$ WebUI is ready! Access it at:</p>
                <Button
                  className="w-full bg-green-600 hover:bg-green-700 text-black border-2 border-green-400 shadow-[4px_4px_0px_0px_rgba(34,197,94,1)] transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none flex items-center justify-center gap-2"
                  onClick={() => {
                    const url = getWebuiUrl();
                    if (url) window.open(url, '_blank');
                  }}
                >
                  {isServiceReady ? "🚀 Open WebUI" : "⏳ Initializing..."}
                </Button>
              </div>
            ) : (
              <div className="animate-pulse">
                <p>$ Initializing service...</p>
                <p>$ Please wait while the WebUI is being prepared...</p>
              </div>
            )}

            {/* Service Status Checks */}
            {pingLogs.length > 0 && (
              <div className="mt-4">
                <p className="mb-2">$ Service Status Checks:</p>
                <pre className="bg-zinc-900 p-4 rounded-lg overflow-x-auto text-sm">
                  {pingLogs.map((log, index) => (
                    <div key={index}>{log}</div>
                  ))}
                </pre>
              </div>
            )}

            {/* Deployment Logs */}
            {deploymentInfo.details.logs && (
              <div className="mt-4">
                <p className="mb-2">$ Deployment Logs:</p>
                <pre className="bg-zinc-900 p-4 rounded-lg overflow-x-auto text-sm">
                  {deploymentInfo.details.logs.join('\n')}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}