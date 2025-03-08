import { useState } from "react";
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
import { ImageIcon, Video, Terminal, Loader2, Sparkles } from "lucide-react";

// Load the Punk Model YAML config
const PUNK_YAML = `version: "1.0"

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
        jupyter notebook --allow-root --ip=0.0.0.0 --NotebookApp.token=test --no-browser > /tmp/jupyter.log 2>&1 &

        apt-get update && apt-get install -y git wget libgl1 libglib2.0-0 || true

        cd /home/jovyan
        if [ ! -d "stable-diffusion-webui" ]; then
          git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui.git
        fi
        cd stable-diffusion-webui

        mkdir -p models/Stable-diffusion

        wget --content-disposition -O models/Stable-diffusion/ultra_realistic_mix_portrait_v1.0.safetensors "https://civitai.com/api/download/models/1478064?token=54e1e8f3a5297c54c4d6a7fe87b200c7"

        cat > webui-user.sh << 'EOF'
        #!/bin/bash
        export COMMANDLINE_ARGS="--listen --port 7860 --enable-insecure-extension-access"
        export PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512
        EOF
        chmod +x webui-user.sh

        echo "Starting Stable Diffusion WebUI..."
        ./webui.sh > /tmp/webui.log 2>&1 &

        sleep 10

        echo "Services started. Container will remain running."

        while true; do
          sleep 60
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

        # Launch the Gradio interface with absolute paths to avoid confusion
        echo "Starting Wan2.1 Gradio interface..."
        cd /home/jovyan/Wan2.1/gradio
        python t2v_1.3B_singleGPU.py --ckpt_dir /home/jovyan/Wan2.1/Wan2.1-T2V-1.3B --prompt_extend_method 'local_qwen' > /tmp/gradio.log 2>&1 &

        # Keep the container running and show logs
        echo "Services started. Container will remain running."
        echo "Jupyter is accessible on port 8888 with token 'test'"
        echo "Wan2.1 Gradio interface should be accessible on port 7860"

        # Keep container running
        while true; do
          sleep 60
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

  const imageForm = useForm<InsertDeployment>({
    resolver: zodResolver(insertDeploymentSchema),
    defaultValues: {
      name: "punk-diffusion",
      yamlConfig: PUNK_YAML,
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
      toast({
        title: "🚀 Deployment Started",
        description: "We're firing up your AI service. Please note: It may take up to 5 minutes for the models to load completely.",
        duration: 10000, // Show for 10 seconds
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

  return (
    <div className="container mx-auto py-10 px-4 bg-zinc-100 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-6xl font-black mb-4 text-zinc-900 tracking-tight relative group">
          <span className="inline-block transform transition-transform group-hover:scale-105">AI Creation Lab</span>
          <Sparkles className="h-8 w-8 text-yellow-400 absolute -right-12 top-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        </h1>
        <p className="text-xl mb-12 text-zinc-600 animate-fade-in">
          Transform your ideas into stunning visuals with the power of AI
        </p>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Image Generation Section */}
          <Card className="border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all duration-300 transform hover:-translate-y-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <ImageIcon className="h-6 w-6" />
                Generate Images
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-zinc-600">Create ultra-realistic portraits using our fine-tuned Stable Diffusion model</p>
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
                    className="w-full bg-black hover:bg-zinc-800 text-white border-2 border-black 
                             shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all duration-300 
                             hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]
                             active:translate-x-1 active:translate-y-1 active:shadow-none
                             disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deployMutation.isPending ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Deploying Punk Model...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span className="relative">
                          🎨
                          <span className="absolute -top-1 -right-1 animate-ping">✨</span>
                        </span>
                        Generate Ultra-Realistic Portraits
                      </span>
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          {/* Video Generation Section */}
          <Card className="border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all duration-300 transform hover:-translate-y-1">
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
                    className="w-full bg-black hover:bg-zinc-800 text-white border-2 border-black 
                             shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all duration-300
                             hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]
                             active:translate-x-1 active:translate-y-1 active:shadow-none
                             disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deployMutation.isPending ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Deploying Wan...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span className="relative">
                          🎬
                          <span className="absolute -top-1 -right-1 animate-ping">✨</span>
                        </span>
                        Generate Amazing Videos
                      </span>
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        {/* Terminal-style Deployment Info */}
        {deploymentInfo && (
          <Card className="mt-8 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-black text-green-400 font-mono animate-fade-in">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl text-green-400">
                <Terminal className="h-5 w-5" />
                Deployment Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 animate-typing">
                <p className="typing-effect">$ Initializing deployment...</p>
                <p>$ Deployment ID: {deploymentInfo.deployment.id}</p>
                <p>$ Lease ID: {deploymentInfo.transaction.leaseId}</p>
                <p>$ Status: {deploymentInfo.details.status}</p>
                <p>$ Provider: {deploymentInfo.details.provider}</p>
                <p>$ Started: {new Date(deploymentInfo.details.startTime).toLocaleString()}</p>
                <p>$ Remaining Time: {deploymentInfo.details.remainingTime}</p>
                <p className="text-yellow-400">$ Note: Please wait up to 5 minutes for the AI models to load completely.</p>
              </div>

              {getWebuiUrl() && (
                <div className="space-y-4 animate-fade-in">
                  <p className="text-green-400 typing-effect">$ WebUI URL: {getWebuiUrl()}</p>
                  <Alert className="bg-yellow-900/20 border-yellow-400/50 mb-4">
                    <AlertDescription className="text-yellow-400 text-sm">
                      ⚠️ The WebUI might take a few more minutes to fully initialize even after the URL is available.
                      If you see a loading screen, please be patient.
                    </AlertDescription>
                  </Alert>
                  <Button
                    className="w-full bg-green-600 hover:bg-green-700 text-black border-2 border-green-400 
                             shadow-[4px_4px_0px_0px_rgba(34,197,94,1)] transition-all duration-300
                             hover:shadow-[6px_6px_0px_0px_rgba(34,197,94,1)]
                             active:translate-x-1 active:translate-y-1 active:shadow-none"
                    onClick={() => {
                      const url = getWebuiUrl();
                      if (url) window.open(url, '_blank');
                    }}
                  >
                    <span className="flex items-center gap-2">
                      🚀
                      <span className="relative">
                        Open WebUI
                        <span className="absolute -top-1 -right-1 animate-ping">✨</span>
                      </span>
                    </span>
                  </Button>
                </div>
              )}

              {/* Deployment Logs */}
              {deploymentInfo.details.logs && (
                <div className="mt-4 animate-fade-in">
                  <p className="mb-2 typing-effect">$ Deployment Logs:</p>
                  <div className="bg-zinc-900 p-4 rounded-lg overflow-hidden">
                    <pre className="overflow-x-auto text-sm max-h-60 overflow-y-auto">
                      {deploymentInfo.details.logs.join('\n')}
                    </pre>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Spheron Attribution Footer */}
      <footer className="mt-12 text-center text-zinc-600 border-t border-zinc-200 pt-6">
        <a
          href="https://spheron.network"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 hover:text-zinc-900 transition-colors"
        >
          Powered by
          <span className="font-bold text-black hover:text-zinc-800">
            Spheron Network
          </span>
          <span className="text-xs animate-ping">✨</span>
        </a>
      </footer>

      <style jsx global>{`
        @keyframes typing {
          from { width: 0 }
          to { width: 100% }
        }

        .typing-effect {
          overflow: hidden;
          white-space: nowrap;
          animation: typing 2s steps(40, end);
        }

        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .animate-fade-in {
          animation: fade-in 0.5s ease-out forwards;
        }

        @keyframes animate-ping {
          0%, 75%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.2); opacity: 0; }
        }

        .animate-ping {
          animation: animate-ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
      `}</style>
    </div>
  );
}