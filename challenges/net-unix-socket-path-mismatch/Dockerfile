FROM debian:12-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y --no-install-recommends nginx curl procps iproute2 sudo && \
    rm -rf /var/lib/apt/lists/*
RUN useradd -m -s /bin/bash trainee && \
    echo "trainee ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
COPY seed.sh /usr/local/bin/seed.sh
COPY check.sh /usr/local/bin/check.sh
RUN chmod +x /usr/local/bin/seed.sh /usr/local/bin/check.sh
RUN /usr/local/bin/seed.sh
WORKDIR /home/trainee
# /run is a fresh tmpfs at container start, so the backend's socket directory
# has to be (re)created here, not in seed.sh -- see AUTHORING.md pitfalls.
CMD ["sh","-c","mkdir -p /run/backend && chown www-data:www-data /run/backend && nginx && exec sleep infinity"]
