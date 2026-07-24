FROM debian:12-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y --no-install-recommends sudo procps coreutils apt-utils && \
    rm -rf /var/lib/apt/lists/*
RUN useradd -m -s /bin/bash trainee && \
    echo "trainee ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
COPY seed.sh /usr/local/bin/seed.sh
COPY check.sh /usr/local/bin/check.sh
RUN chmod +x /usr/local/bin/seed.sh /usr/local/bin/check.sh
RUN /usr/local/bin/seed.sh
WORKDIR /home/trainee
# /var/cache/apt/archives is a size-bounded tmpfs, empty at container start
# (see challenge.json "tmpfs"). Simulate months of never-cleaned package
# cache buildup here, at runtime.
CMD ["sh","-c","mkdir -p /var/cache/apt/archives/partial; \
for n in nginx_1.22.1 openssl_3.0.11 libpq5_15.4 python3.11_3.11.2 curl_7.88.1 \
         git_2.39.2 vim_9.0.1378 postgresql-15_15.4 nodejs_18.19.0 ffmpeg_5.1.3 \
         imagemagick_6.9.11 gcc-12_12.2.0 openjdk-17_17.0.9 ruby_3.1.2 \
         redis-server_7.0.11 mysql-client_8.0.35 haproxy_2.6.12 rsync_3.2.7; do \
  dd if=/dev/zero of=/var/cache/apt/archives/${n}_amd64.deb bs=1M count=1 2>/dev/null; \
done; \
exec sleep infinity"]
