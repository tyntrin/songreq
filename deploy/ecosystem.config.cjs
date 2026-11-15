// pm2 config. Installed to /opt/songreq/ecosystem.config.cjs by deploy.sh.
module.exports = {
  apps: [
    {
      name: "songreq",
      // `current` is a symlink to the active release; deploy.sh flips it, then reloads.
      cwd: "/opt/songreq/current",
      script: "server.js",

      // MUST stay a single fork-mode process. Realtime (SSE) uses an in-process
      // EventEmitter bus, so a second process (cluster mode / instances > 1)
      // would never see events published by the other one.
      exec_mode: "fork",
      instances: 1,

      // 1 GB VM: cap the V8 heap, and let pm2 restart before the kernel OOM killer acts.
      // --env-file loads the shared secrets file (Node 24 built-in; the file must exist).
      node_args: "--max-old-space-size=384 --env-file=/opt/songreq/shared/.env",
      max_memory_restart: "400M",

      autorestart: true,
      kill_timeout: 8000,
      time: true,
      out_file: "/var/log/songreq/app.out.log",
      error_file: "/var/log/songreq/app.err.log",
      merge_logs: true,

      // Non-secret runtime settings (secrets such as DATABASE_URL live in shared/.env).
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        HOSTNAME: "127.0.0.1", // Caddy is the only thing that talks to it
      },
    },
  ],
};
