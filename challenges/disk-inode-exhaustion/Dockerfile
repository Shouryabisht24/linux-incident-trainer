FROM debian:12-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y --no-install-recommends sudo procps coreutils findutils && \
    rm -rf /var/lib/apt/lists/*
RUN useradd -m -s /bin/bash trainee && \
    echo "trainee ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
COPY seed.sh /usr/local/bin/seed.sh
COPY check.sh /usr/local/bin/check.sh
RUN chmod +x /usr/local/bin/seed.sh /usr/local/bin/check.sh
RUN /usr/local/bin/seed.sh
WORKDIR /home/trainee
# The tmpfs at /var/spool/ingest caps inodes at 200. Fill it with tiny leftover
# .tmp files until inodes are exhausted (space stays mostly free -> the twist).
CMD ["sh","-c","mkdir -p /var/spool/ingest; i=0; while touch /var/spool/ingest/msg$i.tmp 2>/dev/null; do i=$((i+1)); done; chmod -R 777 /var/spool/ingest 2>/dev/null; exec sleep infinity"]
