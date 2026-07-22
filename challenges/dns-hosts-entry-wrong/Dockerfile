FROM debian:12-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y --no-install-recommends nginx curl procps iproute2 dnsutils nano sudo && \
    rm -rf /var/lib/apt/lists/*
RUN useradd -m -s /bin/bash trainee && \
    echo "trainee ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
COPY seed.sh /usr/local/bin/seed.sh
COPY check.sh /usr/local/bin/check.sh
RUN chmod +x /usr/local/bin/seed.sh /usr/local/bin/check.sh
RUN /usr/local/bin/seed.sh
WORKDIR /home/trainee
# /etc/hosts is only writable at runtime; inject the bad entry here, then start
# the api.internal service (nginx on :8080) and idle.
CMD ["sh","-c","printf '10.99.99.99 api.internal\\n' >> /etc/hosts; nginx && exec sleep infinity"]
