# Runbook: Deploy บน GCP e2-micro + Cloudflare

เอกสารนี้เขียนสำหรับเจ้าของที่ยังไม่เคยใช้ GCP ทำตามทีละขั้นตามลำดับ คำสั่งทั้งหมดเป็นภาษาอังกฤษ (copy ไปวางได้) ส่วนคำอธิบายเป็นภาษาไทย
ไฟล์ที่เกี่ยวข้องอยู่ในโฟลเดอร์ `deploy/` และ `.github/workflows/` ของ repo นี้ **ยังไม่เคยถูกรันกับเครื่องจริง** ขั้นตอนแรกที่ deploy จริงจึงควรทำตอนมีเวลาแก้ปัญหา ไม่ใช่ก่อนงานแสดง

ตัวอย่างในเอกสารใช้โดเมน `song.example.com` ให้แทนด้วยโดเมนจริงของคุณทุกที่

---

## 0. ภาพรวมและค่าใช้จ่าย

```
ผู้ใช้ -> Cloudflare (CDN, SSL Full strict) -> VM e2-micro: Caddy :443 -> Next.js 127.0.0.1:3000 (pm2) -> Postgres 127.0.0.1:5432
                                                  รูปอวาตาร์ -> Cloudflare R2 (โดเมนสาธารณะ)     backup -> R2 (bucket ส่วนตัว)
```

| รายการ | ค่าที่เลือก | หมายเหตุ |
| --- | --- | --- |
| Region | `us-west1` (Oregon) | region ที่อยู่ใน Free Tier ของ e2-micro |
| เครื่อง | `e2-micro` (2 vCPU แบ่งเวลา, RAM 1 GB) | แอปจึงจำกัด heap ไว้ที่ 384 MB และใช้ swap 2 GB |
| Network tier | **Standard** | ส่งข้อมูลออกฟรี 200 GiB/เดือน |
| ดิสก์ | **Standard persistent disk** (`pd-standard`) 30 GB | ห้ามเลือก Balanced (`pd-balanced`) เพราะไม่ฟรี |
| IPv4 ภายนอก | **ประมาณ $3.64 ต่อเดือน** | GCP คิดค่า external IPv4 แยกต่างหาก (ตรวจจากหน้า network pricing ของ Google) ต่อให้ VM อยู่ใน Free Tier ก็ยังเสียค่านี้ |
| Budget alert | **$5** | ค่า IPv4 อย่างเดียวก็เกือบ $4 จึงตั้ง alert ที่ 50%, 90%, 100% เพื่อสังเกตค่าที่เกินคาด |

ตรวจราคาล่าสุดได้ที่ https://cloud.google.com/vpc/network-pricing และเงื่อนไข Free Tier ที่ https://cloud.google.com/free/docs/free-cloud-features#compute

**ข้อควรรู้เรื่องสถาปัตยกรรม**: แอปใช้ SSE กับ event bus ในโปรเซส จึง **ต้องรัน pm2 เพียง 1 โปรเซส** (fork mode) ห้ามเปลี่ยนเป็น cluster / หลาย instance และการ `pm2 reload` ในโหมดนี้ทำให้แอปดับสั้น ๆ (ไม่กี่วินาที) ระหว่าง deploy ลูกค้าที่เปิดหน้าไว้จะ reconnect เอง

---

## 1. สิ่งที่ต้องมีก่อนเริ่ม

1. บัญชี Google Cloud (ต้องผูกบัตรเครดิตเพื่อเปิด billing)
2. บัญชี Cloudflare และ **โดเมนที่ซื้อแล้ว** ย้าย nameserver ไปที่ Cloudflare เรียบร้อย (Cloudflare จะบอกขั้นตอนตอนเพิ่ม site)
3. บัญชี GitHub ที่มี repo นี้ (Actions ต้องเปิดใช้งาน)
4. LINE Developers account และ Google Cloud OAuth (ใช้โปรเจกต์ GCP เดียวกันได้)
5. คอมพิวเตอร์ที่ติดตั้ง `gcloud` CLI (ไม่บังคับ แต่คำสั่งด้านล่างใช้ gcloud ได้เลย) https://cloud.google.com/sdk/docs/install

---

## 2. GCP: โปรเจกต์ งบประมาณ และ VM

### 2.1 สร้างโปรเจกต์และ billing

1. เข้า https://console.cloud.google.com แล้วกด **Select a project > New project** ตั้งชื่อ `songreq`
2. เมนู **Billing** ผูกบัญชี billing กับโปรเจกต์
3. เปิด Compute Engine API: เมนู **Compute Engine > VM instances** (ครั้งแรกจะให้กด Enable รอ 1-2 นาที)

### 2.2 ตั้ง Budget alert $5

1. เมนู **Billing > Budgets & alerts > Create budget**
2. ชื่อ `songreq-budget`, Scope เลือกโปรเจกต์ `songreq`
3. Amount: **Specified amount = $5**
4. Thresholds: 50%, 90%, 100% (ติ๊กส่งอีเมลถึง Billing Admins)
5. กด Finish

> Budget alert เป็นแค่การแจ้งเตือน **ไม่ได้หยุดการคิดเงินอัตโนมัติ**

### 2.3 สร้าง VM

ผ่านหน้าเว็บ: **Compute Engine > VM instances > Create instance**

- Name: `songreq`
- Region: **us-west1 (Oregon)**, Zone: `us-west1-b`
- Machine type: **E2 > e2-micro**
- Boot disk > Change: OS **Debian 12**, Boot disk type **Standard persistent disk**, Size **30 GB**
- Networking (Advanced options > Networking):
  - Network tags: `songreq`
  - Network interface > External IPv4 address: **Create IP address** (ให้เป็น static ชื่อ `songreq-ip`) และ **Network Service Tier = Standard**
- กด Create

หรือใช้คำสั่งเทียบเท่า:

```bash
gcloud config set project YOUR_PROJECT_ID

gcloud compute addresses create songreq-ip \
  --region=us-west1 --network-tier=STANDARD

gcloud compute instances create songreq \
  --zone=us-west1-b \
  --machine-type=e2-micro \
  --network-tier=STANDARD \
  --address=songreq-ip \
  --image-family=debian-12 --image-project=debian-cloud \
  --boot-disk-size=30GB --boot-disk-type=pd-standard \
  --tags=songreq
```

จด IP ที่ได้ (หน้า VM instances คอลัมน์ External IP) เรียกว่า `VM_IP` ต่อไป

> ถ้าไม่ใช้ VM แล้วต้อง **ลบทั้ง VM และ static IP** (IP ที่จองไว้แต่ไม่ได้ใช้เสียเงินแพงกว่า)

### 2.4 Firewall

ผ่าน Cloudflare เท่านั้นที่ควรเข้าพอร์ต 443 ได้ (ทำให้ header `cf-connecting-ip` ที่แอปใช้ทำ rate limit เชื่อถือได้)

```bash
# 443 เฉพาะ IP ของ Cloudflare (IPv4)
gcloud compute firewall-rules create songreq-https-cloudflare \
  --network=default --direction=INGRESS --action=ALLOW --rules=tcp:443 \
  --target-tags=songreq \
  --source-ranges="$(curl -fsS https://www.cloudflare.com/ips-v4 | paste -sd, -)"

# ลบกฎ RDP ที่ไม่จำเป็น (กฎ default-allow-ssh ที่พอร์ต 22 ยังเก็บไว้ ดูหมายเหตุ)
gcloud compute firewall-rules delete default-allow-rdp --quiet
```

หมายเหตุเรื่อง SSH (พอร์ต 22): GitHub Actions ต้อง SSH เข้ามา deploy และ IP ของ runner เปลี่ยนไปเรื่อย ๆ จึงเปิด 22 ไว้ทั้งหมด แต่ **ปิด password login และใช้ key เท่านั้น** + fail2ban (ตั้งในขั้น 3.4) ถ้าต้องการเข้มกว่านี้ ให้จำกัด 22 ให้เหลือ IP บ้านของคุณ แล้ว deploy ผ่านเครื่องตัวเองแทน

---

## 3. ตั้งค่าเครื่อง VM

เข้า VM: ปุ่ม **SSH** ในหน้า VM instances (หรือ `gcloud compute ssh songreq --zone=us-west1-b`) แล้วรันทุกคำสั่งในหัวข้อนี้ (ใช้ `sudo` ตามที่เขียน)

### 3.1 Timezone และ swap 2 GB

```bash
sudo timedatectl set-timezone Asia/Bangkok

sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swap.conf
sudo sysctl --system
free -h    # ต้องเห็น Swap 2.0Gi
```

### 3.2 ติดตั้งโปรแกรม

```bash
sudo apt-get update && sudo apt-get install -y curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https unzip fail2ban postgresql postgresql-client awscli

# Node.js 24
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # v24.x

# pm2
sudo npm install -g pm2

# Caddy (official apt repo)
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
```

### 3.3 Postgres: สร้างฐานข้อมูลและปรับสำหรับ RAM 1 GB

```bash
# เปลี่ยน CHANGE_ME_DB_PASSWORD เป็นรหัสผ่านสุ่มยาว ๆ (เก็บไว้ใส่ DATABASE_URL)
sudo -u postgres psql <<'SQL'
CREATE ROLE songreq LOGIN PASSWORD 'CHANGE_ME_DB_PASSWORD';
CREATE DATABASE songreq OWNER songreq;
SQL

PGVER=$(ls /etc/postgresql)
sudo tee /etc/postgresql/$PGVER/main/conf.d/songreq.conf <<'CONF'
# Tuned for a 1 GB VM that also runs Node + Caddy
shared_buffers = 128MB
work_mem = 4MB
maintenance_work_mem = 32MB
effective_cache_size = 384MB
max_connections = 20
listen_addresses = 'localhost'
CONF
sudo systemctl restart postgresql
```

`DATABASE_URL` ที่จะใช้: `postgres://songreq:CHANGE_ME_DB_PASSWORD@127.0.0.1:5432/songreq` (ถ้ารหัสผ่านมีอักขระพิเศษ ให้ URL-encode)

### 3.4 ผู้ใช้ โฟลเดอร์ และความปลอดภัย SSH

```bash
# ผู้ใช้ที่รันแอป (ไม่มี login) และผู้ใช้สำหรับ GitHub Actions
sudo useradd --system --create-home --shell /bin/bash songreq
sudo useradd --create-home --shell /bin/bash deploy

sudo mkdir -p /opt/songreq/releases /opt/songreq/shared /var/log/songreq /var/lib/songreq/uploads
sudo chown -R songreq:songreq /opt/songreq /var/log/songreq /var/lib/songreq
sudo chmod 750 /opt/songreq/shared

# SSH: key only
echo 'PasswordAuthentication no
PermitRootLogin no' | sudo tee /etc/ssh/sshd_config.d/99-hardening.conf
sudo systemctl reload ssh
sudo systemctl enable --now fail2ban
```

> `/opt/songreq` เป็นของ `songreq` แต่ `deploy.sh` กับ `current` จะถูกจัดการโดย root ตอน deploy

สร้าง SSH key ให้ GitHub Actions (ทำบนเครื่องคุณ ไม่ใช่บน VM) แล้ววาง public key ให้ user `deploy`:

```bash
# บนเครื่องคุณ
ssh-keygen -t ed25519 -f songreq-deploy -N "" -C "github-actions-deploy"
cat songreq-deploy.pub        # copy บรรทัดนี้

# บน VM
sudo -u deploy mkdir -p /home/deploy/.ssh
echo 'PASTE_PUBLIC_KEY_HERE' | sudo -u deploy tee /home/deploy/.ssh/authorized_keys
sudo chmod 700 /home/deploy/.ssh && sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

ให้ `deploy` รันได้เฉพาะคำสั่ง deploy ด้วย sudo (ไม่ต้องใส่รหัสผ่าน):

```bash
sudo tee /etc/sudoers.d/songreq-deploy <<'EOF'
deploy ALL=(root) NOPASSWD: /usr/bin/bash /opt/songreq/deploy.sh /tmp/release.tgz
deploy ALL=(root) NOPASSWD: /bin/bash /opt/songreq/deploy.sh /tmp/release.tgz
EOF
sudo chmod 440 /etc/sudoers.d/songreq-deploy
sudo visudo -cf /etc/sudoers.d/songreq-deploy
```

---

## 4. R2 (Cloudflare): รูปอวาตาร์ และ backup

เข้า Cloudflare dashboard > **R2 Object Storage** (ครั้งแรกต้องเปิดใช้งานและผูกบัตร มี Free Tier 10 GB)

### 4.1 Bucket รูปอวาตาร์ (สาธารณะ)

1. **Create bucket** ชื่อ `songreq-avatars` (Location: Automatic)
2. เข้า bucket > **Settings > Custom Domains > Connect Domain** ใส่ `img.song.example.com` (โดเมนต้องอยู่ใน Cloudflare account เดียวกัน) รอสถานะ Active
3. **ห้ามเปิด** `r2.dev` public URL (ใช้เฉพาะ custom domain เพื่อให้ผ่าน cache ของ Cloudflare)
4. ค่า `R2_PUBLIC_URL` = `https://img.song.example.com` (ไม่มี `/` ท้ายและไม่มีชื่อ bucket)

แอปอัปโหลดผ่านเซิร์ฟเวอร์ ไม่ใช่จากเบราว์เซอร์โดยตรง จึง **ไม่ต้องตั้ง CORS**

### 4.2 Bucket backup (ส่วนตัว)

สร้าง bucket ที่สอง `songreq-backups` **ห้ามผูก custom domain / ห้ามเปิด public** (เพราะ bucket สาธารณะแปลว่าทุกไฟล์ในนั้นใครก็ดาวน์โหลดได้ ห้ามเอา backup ไปไว้ใน `songreq-avatars`)

### 4.3 API token

R2 > **Manage API Tokens > Create API token**: Permission **Object Read & Write**, เลือก **Apply to specific buckets only** = `songreq-avatars` และ `songreq-backups` กด Create แล้วจด

- Access Key ID -> `R2_ACCESS_KEY_ID`
- Secret Access Key -> `R2_SECRET_ACCESS_KEY` (แสดงครั้งเดียว)
- Account ID (หน้า R2 overview มุมขวา) -> `R2_ACCOUNT_ID`

---

## 5. LINE Login และ Google OAuth

ให้ `APP_URL` = `https://song.example.com` (ไม่มี `/` ท้าย) callback URL คือ `${APP_URL}/api/auth/callback/line` และ `${APP_URL}/api/auth/callback/google`

### 5.1 LINE Login

1. https://developers.line.biz/console/ > สร้าง **Provider** > สร้าง Channel ชนิด **LINE Login** (App type: Web app)
2. แท็บ **LINE Login > Callback URL** ใส่: `https://song.example.com/api/auth/callback/line`
3. แท็บ **Basic settings**: Channel ID -> `AUTH_LINE_ID`, Channel secret -> `AUTH_LINE_SECRET`
4. ขอ scope email ได้ที่แท็บ OpenID Connect (ต้องส่งคำขอและอัปโหลดภาพนโยบายความเป็นส่วนตัว) ถ้ายังไม่ได้รับอนุมัติ อีเมลจะไม่มา
5. เปลี่ยนสถานะ channel จาก Developing เป็น **Published** เมื่อพร้อมให้คนทั่วไปล็อกอิน

### 5.2 Google OAuth

1. https://console.cloud.google.com/apis/credentials (โปรเจกต์ใดก็ได้) > ตั้งค่า **OAuth consent screen** ก่อน (External, ใส่ชื่อแอป อีเมล และ Authorized domain `example.com`) แล้วกด Publish app
2. **Create credentials > OAuth client ID**, Application type **Web application**
3. Authorized redirect URIs: `https://song.example.com/api/auth/callback/google`
4. Client ID -> `AUTH_GOOGLE_ID`, Client secret -> `AUTH_GOOGLE_SECRET`

---

## 6. ไฟล์ environment บน VM

สร้าง `/opt/songreq/shared/.env` (ไฟล์เดียวที่ทั้ง pm2, migration, cron และ backup อ่าน; **ห้าม commit**):

```bash
sudo -u songreq tee /opt/songreq/shared/.env >/dev/null <<'EOF'
APP_URL=https://song.example.com
DATABASE_URL=postgres://songreq:CHANGE_ME_DB_PASSWORD@127.0.0.1:5432/songreq
# สร้างด้วย: openssl rand -base64 32
AUTH_SECRET=CHANGE_ME
# production ต้องไม่เปิด dev login (ค่าไหนก็ตามจะถูกปิดอยู่แล้วเมื่อ NODE_ENV=production แต่ปิดไว้ให้ชัด)
AUTH_DEV_LOGIN=false
AUTH_LINE_ID=
AUTH_LINE_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
# อีเมลแอดมิน คั่นด้วย comma
ADMIN_EMAILS=you@example.com
# แนะนำ r2 ใน production (local = เก็บบนดิสก์ VM ที่ UPLOAD_DIR)
STORAGE_DRIVER=r2
UPLOAD_DIR=/var/lib/songreq/uploads
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=songreq-avatars
R2_PUBLIC_URL=https://img.song.example.com
# ใช้โดย backup.sh เท่านั้น (แอปไม่อ่านค่านี้)
R2_BACKUP_BUCKET=songreq-backups
EOF
sudo chmod 600 /opt/songreq/shared/.env
sudo -u songreq openssl rand -base64 32   # เอาไปใส่ AUTH_SECRET
sudo -u songreq nano /opt/songreq/shared/.env
```

กฎการเขียนไฟล์: บรรทัดละ `KEY=value` ไม่มีเครื่องหมายคำพูดและไม่มีช่องว่างรอบ `=` (ใช้ `node --env-file` อ่าน)

ต้องตั้ง `APP_URL` เสมอ ถ้าไม่ตั้ง แอปจะ log คำเตือนตอนเริ่มและ fallback ไปใช้ header ของ request (QR/โปสเตอร์/ลิงก์เชิญอาจผิดโดเมน)

เมื่อแก้ไฟล์นี้ภายหลังต้อง `sudo -u songreq pm2 restart songreq --update-env` ด้วย

---

## 7. Cloudflare: DNS, SSL, cache

### 7.1 DNS

Cloudflare dashboard > โดเมนของคุณ > **DNS > Records > Add record**

- Type `A`, Name `song`, IPv4 = `VM_IP`, **Proxy status = Proxied (เมฆสีส้ม)**

### 7.2 SSL Full (strict) และ Origin Certificate

1. **SSL/TLS > Overview**: เลือก **Full (strict)**
2. **SSL/TLS > Origin Server > Create Certificate**: คงค่าเริ่มต้น (RSA, hostnames `song.example.com` และ `*.example.com`, อายุ 15 ปี) กด Create
3. คัดลอก **Origin Certificate** และ **Private Key** (แสดงครั้งเดียว) ไปวางบน VM:

```bash
sudo mkdir -p /etc/caddy/certs
sudo nano /etc/caddy/certs/origin.pem   # วาง Origin Certificate
sudo nano /etc/caddy/certs/origin.key   # วาง Private Key
sudo chown -R root:caddy /etc/caddy/certs
sudo chmod 750 /etc/caddy/certs && sudo chmod 640 /etc/caddy/certs/origin.pem /etc/caddy/certs/origin.key
```

4. **SSL/TLS > Edge Certificates**: เปิด **Always Use HTTPS**

### 7.3 Cache rule สำหรับไฟล์ static

**Caching > Cache Rules > Create rule**

- Name: `next-static`
- When: **URI Path** **starts with** `/_next/static/`
- Then: **Eligible for cache**, Edge TTL **Override: 1 year**, Browser TTL **Respect origin** (Next.js ส่ง `immutable` มาให้แล้ว)

ห้ามทำ cache rule กับหน้าอื่นหรือ `/api/*` (หน้าเป็นแบบ dynamic, SSE ต้องไม่ถูก cache)

---

## 8. Caddy

Caddyfile อยู่ที่ `deploy/Caddyfile` ใน repo ใช้ Origin Certificate จากขั้น 7.2 และ proxy ไป `127.0.0.1:3000` พร้อม `flush_interval -1` เพื่อให้ SSE ไม่ถูก buffer

บนเครื่องคุณ (ที่มี repo):

```bash
scp deploy/Caddyfile YOUR_SSH_USER@VM_IP:/tmp/Caddyfile
```

บน VM:

```bash
sudo install -m 644 /tmp/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable --now caddy && sudo systemctl reload caddy
```

---

## 9. Deploy ครั้งแรก

### 9.1 ตั้ง GitHub secrets

GitHub repo > **Settings > Secrets and variables > Actions > New repository secret**

| Secret | ค่า |
| --- | --- |
| `DEPLOY_HOST` | `VM_IP` (ใช้ IP ตรง ไม่ใช่ชื่อโดเมนที่ผ่าน Cloudflare เพราะ Cloudflare ไม่ proxy SSH) |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | เนื้อหาไฟล์ `songreq-deploy` (private key ทั้งไฟล์ รวมบรรทัด BEGIN/END) |

หลังตั้งเสร็จให้ลบไฟล์ `songreq-deploy` บนเครื่องคุณทิ้ง

### 9.2 วาง deploy.sh ครั้งแรก (ครั้งเดียว)

`deploy.sh` ตัวถัดไปจะถูกอัปเดตเองจาก tarball ทุกครั้ง แต่ครั้งแรกต้องวางเอง:

```bash
# บนเครื่องคุณ
scp deploy/deploy.sh YOUR_SSH_USER@VM_IP:/tmp/deploy.sh
# บน VM
sudo install -m 755 -o root -g root /tmp/deploy.sh /opt/songreq/deploy.sh
```

### 9.3 ตั้ง pm2 ให้เริ่มเองเมื่อบูตเครื่อง

```bash
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u songreq --hp /home/songreq
```

### 9.4 รัน deploy

GitHub > **Actions > Deploy > Run workflow** (ref = `main`) ขั้นตอนที่เกิดขึ้น:

1. Runner `npm ci`, ตรวจ typecheck + test, `npm run build` (output standalone) และ `deploy/package.sh` ทำ tarball
2. scp ไป `/tmp/release.tgz` แล้วสั่ง `sudo bash /opt/songreq/deploy.sh /tmp/release.tgz` บน VM
3. `deploy.sh` แตกไฟล์ไป `/opt/songreq/releases/<timestamp>` รัน migration สลับ symlink `/opt/songreq/current` `pm2 reload songreq --update-env` แล้ว poll `http://127.0.0.1:3000/api/health` นาน 30 วินาที
4. ถ้า health check ไม่ผ่านจะ **สลับ symlink กลับ release เดิมและ reload ให้เอง** แล้ว job ล้มเหลว (ดู log ใน Actions และ `/var/log/songreq/app.err.log`)
5. เก็บ release ล่าสุด 3 ชุด

กฎสำคัญ: migration รันก่อนสลับโค้ด ขณะที่โค้ดเก่ายังทำงานอยู่ ดังนั้น migration ต้อง **เพิ่มอย่างเดียว** (เพิ่มตาราง/คอลัมน์ที่ nullable) การลบหรือเปลี่ยนชื่อคอลัมน์ต้องแบ่งเป็น 2 release

ตรวจหลัง deploy:

```bash
curl -s https://song.example.com/api/health          # {"ok":true}
sudo -u songreq pm2 status
sudo -u songreq pm2 logs songreq --lines 50 --nostream
```

ล็อกอินครั้งแรกจะถูกพาไปหน้า `/setup` เพื่อสร้างโปรไฟล์นักดนตรี ส่วนสิทธิ์แอดมินมาจากอีเมลใน `ADMIN_EMAILS` (ล็อกอินด้วยอีเมลนั้นผ่าน LINE/Google)

### 9.5 Rollback เอง

```bash
ls -1dt /opt/songreq/releases/*/                       # ดูรายการ release
sudo ln -sfn /opt/songreq/releases/<timestamp> /opt/songreq/current
sudo -u songreq pm2 reload songreq --update-env
```

---

## 10. Backup และงานประจำคืน (cron)

`deploy.sh` คัดลอก `backup.sh` ไปที่ `/opt/songreq/backup.sh` ให้ทุกครั้งที่ deploy ส่วน cron ตั้งครั้งเดียว:

```bash
sudo mkdir -p /var/log/songreq && sudo chown songreq:songreq /var/log/songreq

# หลัง deploy ครั้งแรก: copy crontab จาก release มาติดตั้งให้ user songreq
sudo cp /opt/songreq/current/deploy/crontab.txt /opt/songreq/crontab.txt
sudo -u songreq crontab /opt/songreq/crontab.txt
sudo -u songreq crontab -l
```

เนื้อหา (เวลาเป็นเวลาไทย เพราะตั้ง timezone VM เป็น Asia/Bangkok แล้ว):

```cron
30 3 * * * /opt/songreq/backup.sh >> /var/log/songreq/backup.log 2>&1
0 4 * * * cd /opt/songreq/current && /usr/bin/node --env-file=/opt/songreq/shared/.env deploy-purge-pii.mjs >> /var/log/songreq/purge-pii.log 2>&1
```

- 03:30 `pg_dump | gzip` อัปโหลดไป R2 bucket `songreq-backups` ด้วย `aws s3 cp --endpoint-url` และลบไฟล์ที่เก่ากว่า 14 วัน
- 04:00 ลบชื่อผู้ขอ/ข้อความที่เก่ากว่า 90 วัน (PDPA) ด้วย `deploy-purge-pii.mjs` ซึ่งเป็นสคริปต์ `scripts/purge-pii.ts` ที่ build มาพร้อม release

ทดสอบ backup ด้วยมือหนึ่งครั้งก่อนเชื่อว่าใช้ได้:

```bash
sudo -u songreq /opt/songreq/backup.sh
sudo -u songreq aws s3 ls s3://songreq-backups/ --endpoint-url https://R2_ACCOUNT_ID.r2.cloudflarestorage.com
```

(คำสั่ง `aws s3 ls` ต้องมี `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_DEFAULT_REGION=auto` ใน environment ของคุณ ใส่ชั่วคราวใน shell เช่น `export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_DEFAULT_REGION=auto` และล้างทิ้งหลังใช้ด้วย `unset`)

หมุนไฟล์ log:

```bash
sudo tee /etc/logrotate.d/songreq <<'EOF'
/var/log/songreq/*.log {
  weekly
  rotate 8
  compress
  missingok
  notifempty
  copytruncate
}
EOF
```

---

## 11. Uptime monitor

ใช้ UptimeRobot (ฟรี) https://uptimerobot.com

1. **Add New Monitor**: Type **HTTP(s)** (หรือ Keyword)
2. URL: `https://song.example.com/api/health`
3. ถ้าใช้ Keyword: คำที่ต้องมี `"ok":true`
4. Interval 5 นาที ตั้ง alert contact เป็นอีเมล/LINE ของคุณ

---

## 12. ซ้อมกู้ข้อมูล (Restore drill)

ซ้อมอย่างน้อยหนึ่งครั้งหลังตั้ง backup และทุกไตรมาส ซ้อมโดยกู้ลงฐานข้อมูลชื่ออื่น ไม่แตะฐานจริง:

```bash
# 1) เลือกไฟล์ backup ล่าสุด (ใช้ credential เดียวกับขั้น 10)
export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_DEFAULT_REGION=auto
EP=https://R2_ACCOUNT_ID.r2.cloudflarestorage.com
aws s3 ls s3://songreq-backups/ --endpoint-url $EP
aws s3 cp s3://songreq-backups/songreq-YYYYMMDD-HHMMSS.sql.gz /tmp/restore.sql.gz --endpoint-url $EP

# 2) กู้ลงฐานชั่วคราว
sudo -u postgres createdb -O songreq songreq_restore
gunzip -c /tmp/restore.sql.gz | PGPASSWORD=CHANGE_ME_DB_PASSWORD psql -h 127.0.0.1 -U songreq -d songreq_restore -v ON_ERROR_STOP=1

# 3) ตรวจว่าข้อมูลครบ
PGPASSWORD=CHANGE_ME_DB_PASSWORD psql -h 127.0.0.1 -U songreq -d songreq_restore -c "select count(*) from performers;" -c "select count(*) from requests;"

# 4) ลบทิ้ง
sudo -u postgres dropdb songreq_restore
rm /tmp/restore.sql.gz
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_REGION
```

### กู้จริง (ฐานข้อมูลเสีย/ข้อมูลหาย)

```bash
sudo -u songreq pm2 stop songreq
sudo -u postgres dropdb songreq
sudo -u postgres createdb -O songreq songreq
gunzip -c /tmp/restore.sql.gz | PGPASSWORD=CHANGE_ME_DB_PASSWORD psql -h 127.0.0.1 -U songreq -d songreq -v ON_ERROR_STOP=1
sudo -u songreq pm2 start songreq
curl -s http://127.0.0.1:3000/api/health
```

ข้อมูลที่กู้ได้คือถึงเวลา backup ล่าสุด (สูงสุดราว 24 ชั่วโมงย้อนหลัง) รูปอวาตาร์อยู่ใน R2 ไม่ได้อยู่ใน dump ไฟล์ใน R2 จึงไม่ถูกกระทบจากการกู้

---

## 13. สรุปที่ต้องตรวจก่อนเปิดใช้จริง

- [ ] Budget alert $5 ตั้งแล้ว และ VM เป็น `e2-micro` ใน `us-west1` ดิสก์ `pd-standard` 30 GB, network tier Standard
- [ ] Firewall 443 เฉพาะ Cloudflare, ไม่มีกฎ 443 เปิดทั้งโลก
- [ ] Cloudflare SSL = Full (strict), DNS เป็น Proxied
- [ ] `https://song.example.com/api/health` ตอบ `{"ok":true}`
- [ ] LINE และ Google login ผ่าน (callback URL ตรงตัวอักษร)
- [ ] `APP_URL` ตั้งแล้ว QR/โปสเตอร์ชี้โดเมนถูกต้อง
- [ ] backup ด้วยมือสำเร็จ และซ้อมกู้แล้วหนึ่งครั้ง
- [ ] UptimeRobot ส่ง alert ถึงคุณได้จริง (ทดสอบโดย `pm2 stop songreq` สั้น ๆ)
- [ ] `/var/log/songreq/*.log` มีบรรทัด backup และ purge หลังข้ามคืนแรก
