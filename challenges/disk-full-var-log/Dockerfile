FROM debian:12-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y --no-install-recommends sudo procps coreutils && \
    rm -rf /var/lib/apt/lists/*
RUN useradd -m -s /bin/bash trainee && \
    echo "trainee ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
COPY seed.sh /usr/local/bin/seed.sh
COPY check.sh /usr/local/bin/check.sh
RUN chmod +x /usr/local/bin/seed.sh /usr/local/bin/check.sh
RUN /usr/local/bin/seed.sh
WORKDIR /home/trainee
# The /var/log/app tmpfs is mounted (empty) at start; fill it here so `df` shows
# a genuinely near-full 20MB filesystem, then idle.
CMD ["sh","-c","mkdir -p /var/log/app && dd if=/dev/zero of=/var/log/app/debug.log bs=1M count=18 2>/dev/null; chmod 666 /var/log/app/debug.log; exec sleep infinity"]
