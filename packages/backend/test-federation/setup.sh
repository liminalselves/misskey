#!/bin/bash
mkdir certificates

# rootCA
openssl genrsa -des3 \
  -passout pass:rootCA \
  -out certificates/rootCA.key 4096
openssl req -x509 -new -nodes -batch \
  -key certificates/rootCA.key \
  -sha256 \
  -days 1024 \
  -passin pass:rootCA \
  -out certificates/rootCA.crt

# domain
function generate {
  openssl req -new -newkey rsa:2048 -sha256 -nodes \
    -keyout certificates/$1.key \
    -subj "/CN=$1/emailAddress=admin@$1/C=JP/ST=/L=/O=Misskey Tester/OU=Some Unit" \
    -out certificates/$1.csr
  openssl x509 -req -sha256 \
    -in certificates/$1.csr \
    -CA certificates/rootCA.crt \
    -CAkey certificates/rootCA.key \
    -CAcreateserial \
    -passin pass:rootCA \
    -out certificates/$1.crt \
    -days 500
  if [ ! -f .config/docker.env ]; then cp .config/example.docker.env .config/docker.env; fi
  if [ ! -f .config/$1.conf ]; then sed "s/\${HOST}/$1/g" .config/example.conf > .config/$1.conf; fi
  if [ ! -f .config/$1.default.yml ]; then sed "s/\${HOST}/$1/g" .config/example.config.json > .config/$1.config.json; fi
}

generate a.test
generate b.test

# pnpm build 会在仓库根目录 built/ 下生成 ._config_.json；compose 又把整个 built 挂到 /misskey/built，
# 再单独 bind 测试用 config 到 /misskey/built/._config_.json 时，若宿主机该路径已存在文件，runc 会报
# "make mountpoint ... file exists"。启动容器前删掉宿主机上的该文件，由 compose 的挂载提供内容。
rm -f "$(dirname "$0")/../../../built/._config_.json"
