FROM debian:12-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y --no-install-recommends nginx dnsmasq curl procps iproute2 dnsutils nano sudo && \
    rm -rf /var/lib/apt/lists/*
RUN useradd -m -s /bin/bash trainee && \
    echo "trainee ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
COPY seed.sh /usr/local/bin/seed.sh
COPY check.sh /usr/local/bin/check.sh
RUN chmod +x /usr/local/bin/seed.sh /usr/local/bin/check.sh
RUN /usr/local/bin/seed.sh
WORKDIR /home/trainee
# /etc/resolv.conf is bind-mounted at runtime and read-only during `docker
# build`, so the bad search-domain config has to be written here in CMD, not
# in seed.sh (see AUTHORING.md pitfalls). The internal DNS resolver (dnsmasq,
# listening on 127.0.0.1:53) and the web app it resolves are started here too.
CMD ["sh","-c","dnsmasq --conf-file=/etc/dnsmasq.d/internal.conf --pid-file=/run/dnsmasq.pid; printf 'nameserver 127.0.0.1\\nsearch prod.example.com\\noptions timeout:1 attempts:1\\n' > /etc/resolv.conf; nginx && exec sleep infinity"]
