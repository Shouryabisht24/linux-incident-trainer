FROM debian:12-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y --no-install-recommends sudo procps nginx curl iproute2 lsof gcc libc6-dev && \
    rm -rf /var/lib/apt/lists/*
RUN useradd -m -s /bin/bash trainee && \
    echo "trainee ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
COPY seed.sh /usr/local/bin/seed.sh
COPY check.sh /usr/local/bin/check.sh
RUN chmod +x /usr/local/bin/seed.sh /usr/local/bin/check.sh
RUN /usr/local/bin/seed.sh
WORKDIR /home/trainee
# Start the stale leftover process first (claims the port), then attempt to
# start nginx the normal way -- it will fail because the port's already
# taken. This mirrors the real incident: nginx isn't broken, it just lost
# the race for its own port.
CMD ["sh","-c","nohup /usr/local/bin/legacy-agent >/dev/null 2>&1 & sleep 1; service nginx start >/dev/null 2>&1 || true; exec sleep infinity"]
